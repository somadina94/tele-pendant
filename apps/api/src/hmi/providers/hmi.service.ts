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
import { PlcService } from '../../plc/providers/plc.service';
import { RegisterMap } from '../../registers/entities/register-map.entity';
import { SafetyStateService } from '../../safety/providers/safety-state.service';
import { AuditActor, auditWriteFields } from '../../common/audit-actor';
import { motionDebug } from '../../common/motion-debug';
import { SafeActionPinService } from '../../users/providers/safe-action-pin.service';
import { UserRole } from '../../users/enums/user-role.enum';
import {
  HMI_ASSET_MIME,
  hmiAssetPublicPath,
  hmiAssetsDirectory,
} from '../hmi-assets';
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

  constructor(
    @InjectRepository(Cell)
    cells: Repository<Cell>,
    @InjectRepository(RegisterMap)
    registers: Repository<RegisterMap>,
    @InjectRepository(BackgroundDisplay)
    backgrounds: Repository<BackgroundDisplay>,
    @InjectRepository(OverlayLabel)
    overlays: Repository<OverlayLabel>,
    @Inject(PlcService) plcService: PlcService,
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

  async getLayout() {
    const cells = await this.cells.find({ order: { row: 'ASC', col: 'ASC' } });
    const background = await this.backgrounds.findOne({
      where: { active: true },
    });
    const overlays = background
      ? await this.overlays.find({
          where: { background: { id: background.id } },
        })
      : [];
    const registers = await this.registers.find({ order: { name: 'ASC' } });
    const backgrounds = await this.listBackgrounds();
    return {
      matrix: {
        rows: cells.reduce((m, c) => Math.max(m, c.row + 1), 0),
        cols: cells.reduce((m, c) => Math.max(m, c.col + 1), 0),
      },
      cells,
      background,
      backgrounds,
      overlays,
      registers,
      safety: this.safetyState.snapshot(),
    };
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
  ): Promise<BackgroundDisplay> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Plant graphic file is required');
    }
    if ((file.size ?? file.buffer.length) > 2_000_000) {
      throw new BadRequestException('Plant graphic must be 2 MB or smaller');
    }
    const ext = HMI_ASSET_MIME[file.mimetype];
    if (!ext) {
      throw new BadRequestException(
        'Unsupported file type — use SVG, PNG, JPEG, WebP, or GIF',
      );
    }
    const filename = `${randomUUID()}.${ext}`;
    writeFileSync(join(hmiAssetsDirectory(), filename), file.buffer);
    const row = await this.activeBackground();
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
    if (addressChanging && (await this.isSafetyRegister(row.id, row.name))) {
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
      throw new ForbiddenException('Indicator lamps are read-only');
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
      throw new ForbiddenException(
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
      throw new ForbiddenException(
        'Motion blocked: claim control, hold deadman, and ensure normal safety mode',
      );
    }

    // Jog selectors and axis move pushbuttons (Home / Welding) need Enable.
    if (cell.isMotion && value) {
      await this.assertEnableHeldForJog();
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
        throw new ForbiddenException('Register is read-only');
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
    };

    // Bundle jog+coil as one high-priority unit so a tag read cannot sneak in.
    const driver = this.plcService.getDriver();
    if (typeof driver.runExclusive === 'function') {
      await driver.runExclusive(writeMotion);
    } else {
      await writeMotion();
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

    if (isEStopCell && value) {
      await this.safetyState.latchOperatorEStop(`STOP: ${cell.label}`);
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

  /** P03A21: motion (jog selectors + axis move PBs) require Enable held. */
  private async assertEnableHeldForJog(): Promise<void> {
    const enable = await this.registers.findOneBy({
      name: pendantDiName('enable'),
    });
    if (!enable || enable.kind !== 'coil') return;
    const driver = this.plcService.getDriver();
    const [on] = await driver.readCoils(enable.address, 1);
    if (!on) {
      throw new ForbiddenException('Hold Enable before using motion controls');
    }
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
    const saved = await this.cells.save(this.cells.create(fields));
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
    const fields = await this.cellFields(input);
    Object.assign(row, fields);
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

  async createOverlay(
    input: OverlayInput,
    actor?: Actor,
  ): Promise<OverlayLabel> {
    const background = await this.activeBackground();
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
      name: string;
      cssBackground?: string | null;
      imageUrl?: string | null;
    },
    actor?: Actor,
  ): Promise<BackgroundDisplay> {
    const name = input.name.trim();
    if (!name) throw new BadRequestException('Background name is required');
    const row = await this.activeBackground();
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
    };
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
  variableSpeed?: boolean;
  slowSpeedPct?: number;
  fastSpeedPct?: number;
  primaryRegisterId: string;
  secondaryRegisterId?: string | null;
  feedbackRegisterId?: string | null;
  statusRegisterId?: string | null;
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
}
