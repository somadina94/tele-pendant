import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Repository } from 'typeorm';
import { AuditService } from '../../audit/providers/audit.service';
import { BackgroundDisplay } from '../../backgrounds/entities/background-display.entity';
import { Cell } from '../../cells/entities/cell.entity';
import { OverlayLabel } from '../../overlays/entities/overlay-label.entity';
import { plcServiceRef } from '../../plc/plc-service.ref';
import type { PlcService } from '../../plc/providers/plc.service';
import { RegisterMap } from '../../registers/entities/register-map.entity';
import { SafetyStateService } from '../../safety/providers/safety-state.service';
import { AuditActor, auditWriteFields } from '../../common/audit-actor';
import { motionDebug } from '../../common/motion-debug';
import { SafeActionPinService } from '../../users/providers/safe-action-pin.service';
import { UserRole } from '../../users/enums/user-role.enum';
import {
  HMI_ASSET_MIME,
  HMI_IMAGE_BYTE_LIMIT,
  HMI_PDF_BYTE_LIMIT,
  hmiAssetPublicPath,
  hmiAssetsDirectory,
  sanitizeSvg,
  svgFailureMessage,
} from '../hmi-assets';
import { renderPdfFirstPage } from '../hmi-pdf';
import { pendantDiName } from '@tele-pendant/modbus-core';
import { cellRequiresControlLease } from '@tele-pendant/shared';

type Actor = AuditActor;

/** Demo / plant names that drive software e-stop, deadman, heartbeat, safe-state. */
const SAFETY_REGISTER_NAMES = new Set([
  'coil.eStop',
  'coil.deadman',
  'holding.heartbeat',
  'holding.safeState',
]);

@Injectable()
export class HmiService {
  private readonly cells: Repository<Cell>;
  private readonly registers: Repository<RegisterMap>;
  private readonly backgrounds: Repository<BackgroundDisplay>;
  private readonly overlays: Repository<OverlayLabel>;
  private readonly plcService: PlcService;
  private readonly safetyState: SafetyStateService;
  private readonly auditService: AuditService;
  private readonly safeActionPin: SafeActionPinService;
  /** Last written holding.speedPct — skip redundant jog writes under hold spam. */
  private lastJogSpeedPct: number | null = null;
  /** Operator screen choice per control client. The active flag stays the admin default. */
  private readonly screenByClient = new Map<string, string>();

  constructor(
    @InjectRepository(Cell)
    cells: Repository<Cell>,
    @InjectRepository(RegisterMap)
    registers: Repository<RegisterMap>,
    @InjectRepository(BackgroundDisplay)
    backgrounds: Repository<BackgroundDisplay>,
    @InjectRepository(OverlayLabel)
    overlays: Repository<OverlayLabel>,
    @Inject(plcServiceRef) plcService: PlcService,
    @Inject(SafetyStateService) safetyState: SafetyStateService,
    @Inject(AuditService) auditService: AuditService,
    @Inject(SafeActionPinService) safeActionPin: SafeActionPinService,
  ) {
    this.cells = cells;
    this.registers = registers;
    this.backgrounds = backgrounds;
    this.overlays = overlays;
    this.plcService = plcService;
    this.safetyState = safetyState;
    this.safeActionPin = safeActionPin;
    this.auditService = auditService;
  }

  async getLayout(clientId?: string, screenId?: string) {
    const requested = screenId?.trim();
    const background = requested
      ? await this.backgrounds.findOneBy({ id: requested })
      : await this.backgroundFor(clientId);
    if (requested && !background) {
      throw new NotFoundException('Background not found');
    }
    const cells = background
      ? await this.cells.find({
          where: { background: { id: background.id } },
          order: { row: 'ASC', col: 'ASC' },
        })
      : [];
    const overlays = background
      ? await this.overlays.find({
          where: { background: { id: background.id } },
        })
      : [];
    const registers = await this.registers.find({ order: { name: 'ASC' } });
    const backgrounds = await this.listBackgrounds();
    const stop = await this.sharedStopCell();
    return {
      matrix: {
        rows: cells.reduce((m, c) => Math.max(m, c.row + 1), 0),
        cols: cells.reduce((m, c) => Math.max(m, c.col + 1), 0),
      },
      cells,
      stop,
      background,
      backgrounds,
      overlays,
      registers,
      safety: this.safetyState.snapshot(),
    };
  }

  /** This device's screen. Does not change the admin default. */
  async selectBackground(
    id: string,
    clientId: string,
  ): Promise<BackgroundDisplay> {
    const row = await this.backgrounds.findOneBy({ id });
    if (!row) throw new NotFoundException('Background not found');
    const device = clientId.trim();
    if (!device) {
      throw new BadRequestException('This device has no id');
    }
    this.screenByClient.set(device, row.id);
    return row;
  }

  async listBackgrounds(): Promise<
    Array<Pick<BackgroundDisplay, 'id' | 'name' | 'active'>>
  > {
    const rows = await this.backgrounds.find({
      order: { name: 'ASC' },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      active: row.active,
    }));
  }

  async createBackground(
    input: {
      name: string;
      cssBackground?: string | null;
      imageUrl?: string | null;
    },
    actor?: Actor,
  ): Promise<BackgroundDisplay> {
    const name = input.name.trim();
    if (!name) throw new BadRequestException('Background name is required');
    const existing = await this.backgrounds.findOne({ where: { name } });
    if (existing) {
      throw new BadRequestException('Background name already exists');
    }
    const row = this.backgrounds.create({
      name,
      cssBackground: input.cssBackground?.trim() || null,
      imageUrl: input.imageUrl?.trim() || null,
      active: false,
    });
    const saved = await this.backgrounds.save(row);
    await this.auditService.write({
      ...this.actorFields(actor),
      action: 'background.create',
      resource: saved.id,
      details: saved.name,
      result: 'success',
    });
    return saved;
  }

  async activateBackground(
    id: string,
    actor?: Actor,
  ): Promise<BackgroundDisplay> {
    const row = await this.backgrounds.findOneBy({ id });
    if (!row) throw new NotFoundException('Background not found');
    const all = await this.backgrounds.find();
    for (const bg of all) {
      bg.active = bg.id === id;
    }
    await this.backgrounds.save(all);
    row.active = true;
    await this.auditService.write({
      ...this.actorFields(actor),
      action: 'background.activate',
      resource: row.id,
      details: row.name,
      result: 'success',
    });
    return row;
  }

  async uploadBackgroundAsset(
    file:
      | {
          buffer: Buffer;
          mimetype: string;
          originalname?: string;
          size?: number;
        }
      | undefined,
    actor?: Actor,
    backgroundId?: string,
  ): Promise<BackgroundDisplay> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Plant graphic file is required');
    }
    const ext = HMI_ASSET_MIME[file.mimetype];
    if (!ext) {
      throw new BadRequestException(
        'Unsupported file type. Use SVG, PNG, JPEG, WebP, GIF, or PDF',
      );
    }
    const byteLimit = ext === 'pdf' ? HMI_PDF_BYTE_LIMIT : HMI_IMAGE_BYTE_LIMIT;
    if ((file.size ?? file.buffer.length) > byteLimit) {
      throw new BadRequestException(
        ext === 'pdf'
          ? 'PDF must be 8 MB or smaller'
          : 'Plant graphic must be 2 MB or smaller',
      );
    }
    const dir = hmiAssetsDirectory();
    let filename = `${randomUUID()}.${ext}`;
    if (ext === 'pdf') {
      let png: Buffer;
      try {
        png = await renderPdfFirstPage(file.buffer);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Could not read that PDF';
        throw new BadRequestException(message);
      }
      const id = filename.replace(/\.pdf$/, '');
      writeFileSync(join(dir, `${id}.pdf`), file.buffer);
      writeFileSync(join(dir, `${id}.png`), png);
      filename = `${id}.png`;
    } else {
      let payload = file.buffer;
      if (ext === 'svg') {
        try {
          payload = Buffer.from(
            sanitizeSvg(file.buffer.toString('utf8')),
            'utf8',
          );
        } catch (err) {
          throw new BadRequestException(svgFailureMessage(err));
        }
      }
      writeFileSync(join(dir, filename), payload);
    }
    const row = await this.screenByIdOrActive(backgroundId);
    row.imageUrl = hmiAssetPublicPath(filename);
    const saved = await this.backgrounds.save(row);
    await this.auditService.write({
      ...this.actorFields(actor),
      action: 'background.asset_upload',
      resource: saved.id,
      details: `${saved.name} → ${saved.imageUrl}`,
      result: 'success',
    });
    return saved;
  }

  /** Picture, buttons, and labels. The copy stays inactive. STOP is shared. */
  async copyBackground(id: string, actor?: Actor): Promise<BackgroundDisplay> {
    const source = await this.backgrounds.findOneBy({ id });
    if (!source) throw new NotFoundException('Background not found');
    const existing = await this.backgrounds.find();
    const taken = new Set(existing.map((row) => row.name));
    let name = `${source.name} copy`;
    let suffix = 2;
    while (taken.has(name)) {
      name = `${source.name} copy ${suffix}`;
      suffix += 1;
    }
    const saved = await this.backgrounds.save(
      this.backgrounds.create({
        name,
        cssBackground: source.cssBackground ?? null,
        imageUrl: source.imageUrl ?? null,
        active: false,
      }),
    );
    const sourceCells = await this.cells.find({
      where: { background: { id: source.id } },
    });
    for (const cell of sourceCells) {
      if (
        this.isProtectedStopCell(cell) ||
        cell.label.trim().toUpperCase() === 'STOP'
      ) {
        continue;
      }
      await this.cells.save(
        this.cells.create({
          row: cell.row,
          col: cell.col,
          label: cell.label,
          style: cell.style,
          isMotion: cell.isMotion,
          requiresSafeAction: cell.requiresSafeAction,
          variableSpeed: cell.variableSpeed,
          slowSpeedPct: cell.slowSpeedPct,
          fastSpeedPct: cell.fastSpeedPct,
          xPct: cell.xPct ?? null,
          yPct: cell.yPct ?? null,
          primaryRegister: cell.primaryRegister ?? null,
          secondaryRegister: cell.secondaryRegister ?? null,
          feedbackRegister: cell.feedbackRegister ?? null,
          statusRegister: cell.statusRegister ?? null,
          background: saved,
        }),
      );
    }
    const sourceOverlays = await this.overlays.find({
      where: { background: { id: source.id } },
    });
    for (const overlay of sourceOverlays) {
      await this.overlays.save(
        this.overlays.create({
          label: overlay.label,
          xPct: overlay.xPct,
          yPct: overlay.yPct,
          format: overlay.format,
          register: overlay.register ?? null,
          background: saved,
        }),
      );
    }
    await this.auditService.write({
      ...this.actorFields(actor),
      action: 'background.copy',
      resource: saved.id,
      details: `${source.name} → ${saved.name}`,
      result: 'success',
    });
    return saved;
  }

  async listRegisters() {
    return this.registers.find({ order: { name: 'ASC' } });
  }

  async updateRegister(
    id: string,
    address: number,
    actor?: Actor,
    extra?: { nodeId?: string | null; trended?: boolean; pin?: string },
  ): Promise<RegisterMap> {
    if (!Number.isInteger(address) || address < 0 || address > 65535) {
      throw new BadRequestException(
        'Address must be an integer from 0 to 65535',
      );
    }
    const row = await this.registers.findOneBy({ id });
    if (!row) throw new NotFoundException('Register not found');

    const addressChanging = row.address !== address;
    if (
      addressChanging &&
      (await this.addressChangeNeedsPin(row.id, row.name))
    ) {
      const ok = await this.safeActionPin.verify(
        actor?.userId,
        extra?.pin ?? '',
      );
      if (!ok) {
        await this.auditService.write({
          ...this.actorFields(actor),
          action: 'register.update_denied',
          resource: row.name,
          details: `${row.name} address change blocked (safety register)`,
          result: 'failure',
        });
        throw new ForbiddenException(
          'PIN does not match — required to change a safety register address',
        );
      }
    }

    row.address = address;
    if (extra && extra.nodeId !== undefined) {
      row.nodeId = extra.nodeId?.trim() ? extra.nodeId.trim() : null;
    }
    if (extra && typeof extra.trended === 'boolean') {
      row.trended = extra.trended;
    }
    const saved = await this.registers.save(row);
    this.plcService.forgetAddresses();
    await this.auditService.write({
      ...this.actorFields(actor),
      action: 'register.update',
      resource: saved.name,
      details: `${saved.name}=${address}`,
      result: 'success',
    });
    return saved;
  }

  /**
   * Safety maps, plus the Enable coil. Moving Enable makes jogs skip the hold check.
   */
  private async addressChangeNeedsPin(
    id: string,
    name: string,
  ): Promise<boolean> {
    if (await this.isSafetyRegister(id, name)) return true;
    if (name === pendantDiName('enable')) return true;
    const enableCell = await this.cells.findOne({
      where: { style: 'enable' },
    });
    return (
      enableCell?.style === 'enable' && enableCell.primaryRegister?.id === id
    );
  }

  /**
   * TP-48: e-stop / deadman / heartbeat / safe-state maps (by name or Safety roles binding).
   */
  private async isSafetyRegister(id: string, name: string): Promise<boolean> {
    if (SAFETY_REGISTER_NAMES.has(name)) return true;
    const roles = await this.safetyState.getRoles();
    return (
      roles.eStopRegisterId === id ||
      roles.deadmanRegisterId === id ||
      roles.heartbeatRegisterId === id ||
      roles.safeStateRegisterId === id
    );
  }

  private actorFields(actor?: Actor) {
    return auditWriteFields(actor);
  }

  async activateCell(
    cellId: string,
    value: boolean,
    opts: {
      userId?: string;
      userEmail?: string;
      userDisplayName?: string | null;
      role?: UserRole;
      safeActionPin?: string;
      ip?: string;
      speed?: 'slow' | 'fast';
      /** Hold refresh: rewrite coil without flooding audit. */
      refresh?: boolean;
      /** Selector rocker: a = primary, b = secondary. */
      direction?: 'a' | 'b';
      /** Operator tab/device id for exclusive control (FEAT-A5). */
      clientId?: string | null;
    },
  ) {
    const started = Date.now();
    const cell = await this.cells.findOne({ where: { id: cellId } });
    if (!cell?.primaryRegister) {
      throw new NotFoundException('Cell or primary register not found');
    }

    if (cell.style === 'lamp') {
      this.refuseActivation(opts, cell.label, 'Indicator lamps are read-only');
    }

    const isSelector = cell.style === 'selector';
    if (isSelector && value && !opts.direction) {
      throw new BadRequestException(
        'Selector cells require direction a or b when asserting',
      );
    }
    if (isSelector && opts.direction === 'b' && !cell.secondaryRegister) {
      throw new BadRequestException('Selector cell has no secondary register');
    }

    const isEStopCell =
      cell.requiresSafeAction ||
      cell.style === 'estop' ||
      cell.primaryRegister.name === 'coil.eStop';
    const safety = this.safetyState.snapshot();
    if ((safety.eStopActive || safety.mode !== 'normal') && !isEStopCell) {
      this.refuseActivation(
        opts,
        cell.label,
        'Operator buttons are blocked until safety mode is normal',
      );
    }
    const needsControl = cellRequiresControlLease({
      isMotion: cell.isMotion,
      style: cell.style,
      label: cell.label,
      requiresSafeAction: cell.requiresSafeAction,
    });
    // Asserts always need the lease. Non-motion clears (OWFF centre) do too.
    // Motion release stays open so a dropped lease cannot leave a jog coil on.
    if (
      needsControl &&
      (value || !cell.isMotion) &&
      !this.safetyState.holdsControl(opts.userId, opts.clientId)
    ) {
      this.refuseActivation(
        opts,
        cell.label,
        'Claim control before using operator buttons',
      );
    }

    if (
      cell.isMotion &&
      value &&
      !this.safetyState.canIssueMotion(opts.userId, opts.clientId)
    ) {
      motionDebug('activate.blocked', {
        cellId,
        label: cell.label,
        userId: opts.userId ?? null,
        refresh: Boolean(opts.refresh),
      });
      this.refuseActivation(
        opts,
        cell.label,
        'Motion blocked: claim control, hold deadman, and ensure normal safety mode',
      );
    }

    // Jog selectors and axis move pushbuttons (Home / Welding) need Enable.
    if (cell.isMotion && value) {
      await this.assertEnableHeldForJog(opts, cell.label);
    }

    // STOP is one press. The PIN is only required to reset e-stop.
    if (isEStopCell && !value) {
      return { ok: true, cellId: cell.id, value: false, latched: true };
    }

    const speedMode = opts.speed === 'slow' ? 'slow' : 'fast';
    const usesVariableSpeed = cell.isMotion && (cell.variableSpeed ?? true);
    const activeReg =
      isSelector && opts.direction === 'b' && cell.secondaryRegister
        ? cell.secondaryRegister
        : cell.primaryRegister;
    const otherReg =
      isSelector && cell.secondaryRegister
        ? opts.direction === 'b'
          ? cell.primaryRegister
          : cell.secondaryRegister
        : null;

    const writeCoilLike = async (
      reg: NonNullable<Cell['primaryRegister']>,
      on: boolean,
    ) => {
      if (reg.kind === 'coil') {
        await this.plcService.writeCoil(reg.address, on);
        if (cell.isMotion) {
          if (on) this.safetyState.noteMotionCoilAsserted(reg.address);
          else this.safetyState.noteMotionCoilCleared(reg.address);
        }
      } else if (reg.kind === 'holding') {
        await this.plcService.writeHolding(reg.address, on ? 1 : 0);
      } else {
        this.refuseActivation(opts, cell.label, 'Register is read-only');
      }
    };

    const writeMotion = async () => {
      // Hold refresh only re-asserts the coil — skip jog rewrite.
      if (usesVariableSpeed && value && !opts.refresh) {
        await this.writeJogSpeedPct(cell, speedMode);
      }
      if (isSelector) {
        if (value) {
          // Mutual exclusion: assert one side, clear the other.
          if (otherReg) await writeCoilLike(otherReg, false);
          await writeCoilLike(activeReg, true);
        } else if (opts.direction) {
          await writeCoilLike(activeReg, false);
        } else {
          // Center / full release: clear both sides.
          await writeCoilLike(cell.primaryRegister!, false);
          if (cell.secondaryRegister) {
            await writeCoilLike(cell.secondaryRegister, false);
          }
        }
      } else {
        await writeCoilLike(activeReg, value);
      }
      if (usesVariableSpeed && !value) {
        await this.writeJogSpeedPct(cell, null);
      }
      if (cell.style === 'enable' && !value) {
        await this.clearJogCoils();
      }
    };

    // Bundle jog+coil as one high-priority unit so a tag read cannot sneak in.
    const driver = this.plcService.getDriver();
    const performWrite = async () => {
      if (typeof driver.runExclusive === 'function') {
        await driver.runExclusive(writeMotion);
      } else {
        await writeMotion();
      }
    };

    // Latch first. A frozen PLC must not hold the STOP response for the write timeout.
    if (isEStopCell && value) {
      await this.safetyState.latchOperatorEStop(`STOP: ${cell.label}`);
      void performWrite().catch(() => undefined);
    } else {
      await performWrite();
    }

    if (!opts.refresh) {
      // Audit must not block Modbus/live tags on the activate hot path.
      void this.auditService
        .write({
          userId: opts.userId,
          userEmail: opts.userEmail,
          userDisplayName: opts.userDisplayName ?? null,
          action: 'cell.activate',
          resource: cell.label,
          details: [
            `${cell.label}=${value}`,
            `client=${opts.clientId ?? ''}`,
            usesVariableSpeed ? `speed=${value ? speedMode : 'off'}` : null,
            opts.direction ? `dir=${opts.direction}` : null,
          ]
            .filter(Boolean)
            .join(';'),
          ip: opts.ip,
          result: 'success',
        })
        .catch(() => undefined);
    }

    if (cell.isMotion) {
      motionDebug('activate.ok', {
        cellId: cell.id,
        label: cell.label,
        value,
        refresh: Boolean(opts.refresh),
        direction: opts.direction ?? null,
        speed: usesVariableSpeed && value ? speedMode : null,
        ms: Date.now() - started,
        userId: opts.userId ?? null,
      });
    }

    return {
      ok: true,
      cellId: cell.id,
      value,
      ...(opts.direction ? { direction: opts.direction } : {}),
      ...(usesVariableSpeed && value ? { speed: speedMode } : {}),
    };
  }

  /** Enable release drops jog coils even if the client never sent jog false. */
  private async clearJogCoils(): Promise<void> {
    const motion = await this.cells.find({
      where: { isMotion: true },
      relations: { primaryRegister: true, secondaryRegister: true },
    });
    for (const jog of motion) {
      for (const reg of [jog.primaryRegister, jog.secondaryRegister]) {
        if (reg?.kind === 'coil') {
          await this.plcService.writeCoil(reg.address, false);
          this.safetyState.noteMotionCoilCleared(reg.address);
        }
      }
    }
  }

  /** P03A21: motion (jog selectors + axis move PBs) require Enable held. */
  private async assertEnableHeldForJog(
    opts: {
      userId?: string;
      userEmail?: string;
      userDisplayName?: string | null;
      ip?: string;
      refresh?: boolean;
      clientId?: string | null;
    },
    label: string,
  ): Promise<void> {
    const enable = await this.registers.findOneBy({
      name: pendantDiName('enable'),
    });
    if (!enable || enable.kind !== 'coil') return;
    const driver = this.plcService.getDriver();
    const [on] = await driver.readCoils(enable.address, 1);
    if (!on) {
      this.refuseActivation(
        opts,
        label,
        'Hold Enable before using motion controls',
      );
    }
  }

  private refuseActivation(
    opts: {
      userId?: string;
      userEmail?: string;
      userDisplayName?: string | null;
      ip?: string;
      refresh?: boolean;
      clientId?: string | null;
    },
    resource: string,
    message: string,
  ): never {
    if (!opts.refresh) {
      void this.auditService
        .write({
          userId: opts.userId,
          userEmail: opts.userEmail,
          userDisplayName: opts.userDisplayName ?? null,
          action: 'cell.activate',
          resource,
          details: `client=${opts.clientId ?? ''}; ${message}`,
          ip: opts.ip,
          result: 'failure',
        })
        .catch(() => undefined);
    }
    throw new ForbiddenException(message);
  }

  /**
   * Raw coil writes use the same rules as a pendant press.
   * Motion needs control, Enable, and deadman. Clearing e-stop needs the reset PIN.
   */
  async writeGuardedCoil(
    address: number,
    value: boolean,
    opts: {
      userId?: string;
      userEmail?: string;
      userDisplayName?: string | null;
      role?: UserRole;
      pin?: string;
      ip?: string;
      clientId?: string | null;
    },
  ): Promise<{ ok: true }> {
    const rows = await this.cells.find({
      relations: { primaryRegister: true, secondaryRegister: true },
    });
    const cell = rows.find((row) =>
      [row.primaryRegister, row.secondaryRegister].some(
        (reg) => reg?.kind === 'coil' && reg.address === address,
      ),
    );
    const estop = cell
      ? Boolean(cell.requiresSafeAction) ||
        cell.style === 'estop' ||
        cell.primaryRegister?.name === 'coil.eStop' ||
        cell.secondaryRegister?.name === 'coil.eStop'
      : await this.isEStopCoilAddress(address);
    if (estop && !value) {
      await this.safetyState.resetEStop(opts.pin ?? '', {
        userId: opts.userId,
        userEmail: opts.userEmail,
        userDisplayName: opts.userDisplayName ?? null,
        ip: opts.ip,
      });
      return { ok: true };
    }
    if (cell) {
      const direction =
        cell.style === 'selector'
          ? cell.secondaryRegister?.address === address
            ? 'b'
            : 'a'
          : undefined;
      await this.activateCell(cell.id, value, {
        userId: opts.userId,
        userEmail: opts.userEmail,
        userDisplayName: opts.userDisplayName,
        role: opts.role,
        safeActionPin: opts.pin,
        ip: opts.ip,
        clientId: opts.clientId,
        direction,
      });
      return { ok: true };
    }
    if (estop && value) {
      await this.safetyState.latchOperatorEStop('STOP: raw coil');
    }
    await this.plcService.writeCoil(address, value);
    return { ok: true };
  }

  private async isEStopCoilAddress(address: number): Promise<boolean> {
    const named = await this.registers.findOneBy({ name: 'coil.eStop' });
    if (named?.kind === 'coil' && named.address === address) return true;
    const roles = await this.safetyState.getRoles();
    if (!roles.eStopRegisterId) return false;
    const bound = await this.registers.findOneBy({ id: roles.eStopRegisterId });
    return bound?.kind === 'coil' && bound.address === address;
  }

  /** FEAT-A2: write holding.speedPct for slow/fast jog (0 clears). */
  private async writeJogSpeedPct(
    cell: Cell,
    mode: 'slow' | 'fast' | null,
  ): Promise<void> {
    const speedReg = await this.registers.findOneBy({
      name: 'holding.speedPct',
    });
    if (!speedReg || speedReg.kind !== 'holding') {
      return;
    }
    const slow = Math.min(100, Math.max(1, cell.slowSpeedPct ?? 30));
    const fast = Math.min(100, Math.max(1, cell.fastSpeedPct ?? 100));
    const pct = mode === null ? 0 : mode === 'slow' ? slow : fast;
    if (this.lastJogSpeedPct === pct) return;
    await this.plcService.writeHolding(speedReg.address, pct);
    this.lastJogSpeedPct = pct;
  }

  async createCell(input: CellInput, actor?: Actor): Promise<Cell> {
    const fields = await this.cellFields(input);
    const background = await this.screenByIdOrActive(input.backgroundId);
    const saved = await this.cells.save(
      this.cells.create({ ...fields, background }),
    );
    await this.auditService.write({
      ...this.actorFields(actor),
      action: 'cell.create',
      resource: saved.label,
      details: saved.label,
      result: 'success',
    });
    return saved;
  }

  async updateCell(id: string, input: CellInput, actor?: Actor): Promise<Cell> {
    const row = await this.cells.findOne({
      where: { id },
      relations: { primaryRegister: true },
    });
    if (!row) throw new NotFoundException('Cell not found');
    await this.assertStopCellNotDemoted(row, input);
    await this.assertMotionNotDemoted(row, input, actor);
    const fields = await this.cellFields(input);
    const background = input.backgroundId?.trim()
      ? await this.screenByIdOrActive(input.backgroundId)
      : (row.background ?? (await this.activeBackground()));
    Object.assign(row, fields, { background });
    const saved = await this.cells.save(row);
    await this.auditService.write({
      ...this.actorFields(actor),
      action: 'cell.update',
      resource: saved.label,
      details: saved.label,
      result: 'success',
    });
    return saved;
  }

  async deleteCell(id: string, actor?: Actor): Promise<{ ok: true }> {
    const row = await this.cells.findOne({
      where: { id },
      relations: { primaryRegister: true },
    });
    if (!row) throw new NotFoundException('Cell not found');
    if (this.isProtectedStopCell(row)) {
      throw new ForbiddenException('The STOP cell cannot be deleted');
    }
    await this.cells.delete({ id });
    await this.auditService.write({
      ...this.actorFields(actor),
      action: 'cell.delete',
      resource: row.label,
      details: row.label,
      result: 'success',
    });
    return { ok: true };
  }

  /** STOP / e-stop cells must stay e-stop and cannot be deleted (TP-07). */
  private isProtectedStopCell(row: {
    requiresSafeAction?: boolean;
    style?: string;
    primaryRegister?: { name?: string } | null;
  }): boolean {
    return (
      Boolean(row.requiresSafeAction) ||
      row.style === 'estop' ||
      row.primaryRegister?.name === 'coil.eStop'
    );
  }

  private async assertStopCellNotDemoted(
    row: Cell,
    input: CellInput,
  ): Promise<void> {
    if (!this.isProtectedStopCell(row)) return;
    const primary = await this.registerById(input.primaryRegisterId);
    const stillProtected =
      input.requiresSafeAction === true &&
      input.style.trim() === 'estop' &&
      primary.name === 'coil.eStop' &&
      input.isMotion === false;
    if (!stillProtected) {
      throw new ForbiddenException(
        'The STOP cell cannot be changed away from e-stop',
      );
    }
  }

  /** Turning Motion off removes the Enable and deadman gates for that button. */
  private async assertMotionNotDemoted(
    row: Cell,
    input: CellInput,
    actor?: Actor,
  ): Promise<void> {
    if (!row.isMotion || input.isMotion !== false) return;
    const ok = await this.safeActionPin.verify(actor?.userId, input.pin ?? '');
    if (ok) return;
    await this.auditService.write({
      ...this.actorFields(actor),
      action: 'cell.update_denied',
      resource: row.label,
      details: `${row.label} motion flag left unchanged`,
      result: 'failure',
    });
    throw new ForbiddenException(
      'PIN does not match — required to turn motion off',
    );
  }

  async createOverlay(
    input: OverlayInput,
    actor?: Actor,
  ): Promise<OverlayLabel> {
    const background = await this.screenByIdOrActive(input.backgroundId);
    const fields = await this.overlayFields(input);
    const saved = await this.overlays.save(
      this.overlays.create({ ...fields, background }),
    );
    await this.auditService.write({
      ...this.actorFields(actor),
      action: 'overlay.create',
      resource: saved.id,
      details: saved.label,
      result: 'success',
    });
    return saved;
  }

  async updateOverlay(
    id: string,
    input: OverlayInput,
    actor?: Actor,
  ): Promise<OverlayLabel> {
    const row = await this.overlays.findOneBy({ id });
    if (!row) throw new NotFoundException('Overlay not found');
    Object.assign(row, await this.overlayFields(input));
    if (input.backgroundId?.trim()) {
      row.background = await this.screenByIdOrActive(input.backgroundId);
    }
    const saved = await this.overlays.save(row);
    await this.auditService.write({
      ...this.actorFields(actor),
      action: 'overlay.update',
      resource: saved.id,
      details: saved.label,
      result: 'success',
    });
    return saved;
  }

  async deleteOverlay(id: string, actor?: Actor): Promise<{ ok: true }> {
    const row = await this.overlays.findOneBy({ id });
    if (!row) throw new NotFoundException('Overlay not found');
    await this.overlays.delete({ id });
    await this.auditService.write({
      ...this.actorFields(actor),
      action: 'overlay.delete',
      resource: id,
      details: row.label,
      result: 'success',
    });
    return { ok: true };
  }

  async updateBackground(
    input: {
      id?: string;
      name: string;
      cssBackground?: string | null;
      imageUrl?: string | null;
    },
    actor?: Actor,
  ): Promise<BackgroundDisplay> {
    const name = input.name.trim();
    if (!name) throw new BadRequestException('Background name is required');
    const row = await this.screenByIdOrActive(input.id);
    row.name = name;
    row.cssBackground = input.cssBackground?.trim() || null;
    row.imageUrl = input.imageUrl?.trim() || null;
    const saved = await this.backgrounds.save(row);
    await this.auditService.write({
      ...this.actorFields(actor),
      action: 'background.update',
      resource: saved.id,
      details: saved.name,
      result: 'success',
    });
    return saved;
  }

  private async activeBackground(): Promise<BackgroundDisplay> {
    const row = await this.backgrounds.findOne({ where: { active: true } });
    if (!row) throw new NotFoundException('No active background');
    return row;
  }

  /** The screen being edited, or the shared default when no id is sent. */
  private async screenByIdOrActive(
    id?: string | null,
  ): Promise<BackgroundDisplay> {
    const wanted = id?.trim();
    if (!wanted) return this.activeBackground();
    const row = await this.backgrounds.findOneBy({ id: wanted });
    if (!row) throw new NotFoundException('Background not found');
    return row;
  }

  private async backgroundFor(
    clientId?: string,
  ): Promise<BackgroundDisplay | null> {
    const fallback = await this.backgrounds.findOne({
      where: { active: true },
    });
    const device = clientId?.trim();
    if (!device) return fallback;
    const chosenId = this.screenByClient.get(device);
    if (!chosenId) return fallback;
    const chosen = await this.backgrounds.findOneBy({ id: chosenId });
    if (!chosen) {
      this.screenByClient.delete(device);
      return fallback;
    }
    return chosen;
  }

  /** STOP is shared. A screen that did not define one still receives this cell. */
  private async sharedStopCell(): Promise<Cell | null> {
    const rows = await this.cells.find();
    return (
      rows.find(
        (cell) =>
          cell.style === 'estop' || cell.label.trim().toUpperCase() === 'STOP',
      ) ?? null
    );
  }

  private async cellFields(input: CellInput): Promise<Partial<Cell>> {
    const label = input.label.trim();
    const style = input.style.trim();
    if (!label || !style) {
      throw new BadRequestException('Label and style are required');
    }
    if (
      !Number.isInteger(input.row) ||
      !Number.isInteger(input.col) ||
      input.row < 0 ||
      input.col < 0 ||
      input.row > 32 ||
      input.col > 32
    ) {
      throw new BadRequestException('Row and column must be integers 0 to 32');
    }
    const primaryRegister = await this.registerById(input.primaryRegisterId);
    const secondaryRegister = await this.optionalRegister(
      input.secondaryRegisterId,
    );
    if (style === 'selector' && !secondaryRegister) {
      throw new BadRequestException(
        'Selector cells require a secondaryRegisterId',
      );
    }
    const slowSpeedPct = clampSpeedPct(input.slowSpeedPct, 30);
    const fastSpeedPct = clampSpeedPct(input.fastSpeedPct, 100);
    if (slowSpeedPct > fastSpeedPct) {
      throw new BadRequestException(
        'slowSpeedPct must be less than or equal to fastSpeedPct',
      );
    }
    return {
      row: input.row,
      col: input.col,
      label,
      style,
      isMotion: input.isMotion,
      requiresSafeAction: input.requiresSafeAction,
      variableSpeed: input.variableSpeed ?? input.isMotion,
      slowSpeedPct,
      fastSpeedPct,
      primaryRegister,
      secondaryRegister,
      feedbackRegister: await this.optionalRegister(input.feedbackRegisterId),
      statusRegister: await this.optionalRegister(input.statusRegisterId),
      ...this.buttonPosition(input),
    };
  }

  private buttonPosition(input: CellInput): {
    xPct: number | null;
    yPct: number | null;
  } {
    const x = input.xPct;
    const y = input.yPct;
    const hasX = x !== undefined && x !== null;
    const hasY = y !== undefined && y !== null;
    if (!hasX && !hasY) return { xPct: null, yPct: null };
    if (!hasX || !hasY || x < 0 || y < 0 || x > 100 || y > 100) {
      throw new BadRequestException(
        'Button position must be between 0 and 100',
      );
    }
    return { xPct: x, yPct: y };
  }

  private async overlayFields(
    input: OverlayInput,
  ): Promise<Partial<OverlayLabel>> {
    const label = input.label.trim();
    const format = input.format.trim();
    if (!label || !format) {
      throw new BadRequestException('Label and format are required');
    }
    if (
      input.xPct < 0 ||
      input.xPct > 100 ||
      input.yPct < 0 ||
      input.yPct > 100
    ) {
      throw new BadRequestException('Position must be from 0 to 100');
    }
    return {
      label,
      format,
      xPct: input.xPct,
      yPct: input.yPct,
      register: await this.optionalRegister(input.registerId),
    };
  }

  private async optionalRegister(
    id?: string | null,
  ): Promise<RegisterMap | null> {
    if (!id?.trim()) return null;
    return this.registerById(id);
  }

  private async registerById(id: string): Promise<RegisterMap> {
    const row = await this.registers.findOneBy({ id });
    if (!row) throw new BadRequestException(`Register not found: ${id}`);
    return row;
  }
}

interface CellInput {
  row: number;
  col: number;
  label: string;
  style: string;
  isMotion: boolean;
  requiresSafeAction: boolean;
  pin?: string;
  variableSpeed?: boolean;
  slowSpeedPct?: number;
  fastSpeedPct?: number;
  primaryRegisterId: string;
  secondaryRegisterId?: string | null;
  feedbackRegisterId?: string | null;
  statusRegisterId?: string | null;
  backgroundId?: string;
  xPct?: number | null;
  yPct?: number | null;
}

function clampSpeedPct(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(100, Math.max(1, Math.round(value)));
}

interface OverlayInput {
  label: string;
  xPct: number;
  yPct: number;
  format: string;
  registerId?: string | null;
  backgroundId?: string;
}
