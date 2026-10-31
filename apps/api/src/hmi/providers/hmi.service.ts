import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditService } from '../../audit/providers/audit.service';
import { BackgroundDisplay } from '../../backgrounds/entities/background-display.entity';
import { Cell } from '../../cells/entities/cell.entity';
import { OverlayLabel } from '../../overlays/entities/overlay-label.entity';
import { PlcService } from '../../plc/providers/plc.service';
import { RegisterMap } from '../../registers/entities/register-map.entity';
import { SafetyStateService } from '../../safety/providers/safety-state.service';
import { UserRole } from '../../users/enums/user-role.enum';

@Injectable()
export class HmiService {
  private readonly cells: Repository<Cell>;
  private readonly registers: Repository<RegisterMap>;
  private readonly backgrounds: Repository<BackgroundDisplay>;
  private readonly overlays: Repository<OverlayLabel>;
  private readonly plcService: PlcService;
  private readonly safetyState: SafetyStateService;
  private readonly auditService: AuditService;

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
  ) {
    this.cells = cells;
    this.registers = registers;
    this.backgrounds = backgrounds;
    this.overlays = overlays;
    this.plcService = plcService;
    this.safetyState = safetyState;
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
    return {
      matrix: {
        rows: cells.reduce((m, c) => Math.max(m, c.row + 1), 0),
        cols: cells.reduce((m, c) => Math.max(m, c.col + 1), 0),
      },
      cells,
      background,
      overlays,
      registers,
      safety: this.safetyState.snapshot(),
    };
  }

  async listRegisters() {
    return this.registers.find({ order: { name: 'ASC' } });
  }

  async updateRegister(id: string, address: number): Promise<RegisterMap> {
    if (!Number.isInteger(address) || address < 0 || address > 65535) {
      throw new BadRequestException(
        'Address must be an integer from 0 to 65535',
      );
    }
    const row = await this.registers.findOneBy({ id });
    if (!row) throw new NotFoundException('Register not found');
    row.address = address;
    const saved = await this.registers.save(row);
    this.plcService.forgetAddresses();
    await this.auditService.write({
      action: 'register.update',
      resource: saved.id,
      details: `${saved.name}=${address}`,
      result: 'success',
    });
    return saved;
  }

  async activateCell(
    cellId: string,
    value: boolean,
    opts: {
      userId?: string;
      userEmail?: string;
      role?: UserRole;
      safeActionPin?: string;
      ip?: string;
    },
  ) {
    const cell = await this.cells.findOne({ where: { id: cellId } });
    if (!cell?.primaryRegister) {
      throw new NotFoundException('Cell or primary register not found');
    }

    if (cell.isMotion && !this.safetyState.canIssueMotion()) {
      throw new ForbiddenException(
        'Motion blocked: hold deadman and ensure normal safety mode',
      );
    }

    if (cell.requiresSafeAction) {
      const expected = (
        process.env.SAFE_ACTION_PIN ||
        process.env.ADMIN_PASSWORD ||
        ''
      ).trim();
      const provided = opts.safeActionPin?.trim() ?? '';
      if (!provided || provided !== expected) {
        await this.auditService.write({
          userId: opts.userId,
          userEmail: opts.userEmail,
          action: 'cell.safe_action_denied',
          resource: cell.id,
          ip: opts.ip,
          result: 'failure',
        });
        throw new ForbiddenException(
          'SAFE_ACTION_PIN does not match. Type the value from .env (this demo uses the admin password), not the name SAFE_ACTION_PIN.',
        );
      }
      if (opts.role === UserRole.OPERATOR) {
        throw new ForbiddenException(
          'Operator cannot authorize independent safe actions',
        );
      }
    }

    const reg = cell.primaryRegister;
    if (reg.kind === 'coil') {
      await this.plcService.writeCoil(reg.address, value);
    } else if (reg.kind === 'holding') {
      await this.plcService.writeHolding(reg.address, value ? 1 : 0);
    } else {
      throw new ForbiddenException('Register is read-only');
    }

    await this.auditService.write({
      userId: opts.userId,
      userEmail: opts.userEmail,
      action: 'cell.activate',
      resource: cell.id,
      details: `${cell.label}=${value}`,
      ip: opts.ip,
      result: 'success',
    });

    return { ok: true, cellId: cell.id, value };
  }

  async createCell(input: CellInput): Promise<Cell> {
    const fields = await this.cellFields(input);
    const saved = await this.cells.save(this.cells.create(fields));
    await this.auditService.write({
      action: 'cell.create',
      resource: saved.id,
      details: saved.label,
      result: 'success',
    });
    return saved;
  }

  async updateCell(id: string, input: CellInput): Promise<Cell> {
    const row = await this.cells.findOneBy({ id });
    if (!row) throw new NotFoundException('Cell not found');
    const fields = await this.cellFields(input);
    Object.assign(row, fields);
    const saved = await this.cells.save(row);
    await this.auditService.write({
      action: 'cell.update',
      resource: saved.id,
      details: saved.label,
      result: 'success',
    });
    return saved;
  }

  async deleteCell(id: string): Promise<{ ok: true }> {
    const row = await this.cells.findOneBy({ id });
    if (!row) throw new NotFoundException('Cell not found');
    await this.cells.delete({ id });
    await this.auditService.write({
      action: 'cell.delete',
      resource: id,
      details: row.label,
      result: 'success',
    });
    return { ok: true };
  }

  async createOverlay(input: OverlayInput): Promise<OverlayLabel> {
    const background = await this.activeBackground();
    const fields = await this.overlayFields(input);
    const saved = await this.overlays.save(
      this.overlays.create({ ...fields, background }),
    );
    await this.auditService.write({
      action: 'overlay.create',
      resource: saved.id,
      details: saved.label,
      result: 'success',
    });
    return saved;
  }

  async updateOverlay(id: string, input: OverlayInput): Promise<OverlayLabel> {
    const row = await this.overlays.findOneBy({ id });
    if (!row) throw new NotFoundException('Overlay not found');
    Object.assign(row, await this.overlayFields(input));
    const saved = await this.overlays.save(row);
    await this.auditService.write({
      action: 'overlay.update',
      resource: saved.id,
      details: saved.label,
      result: 'success',
    });
    return saved;
  }

  async deleteOverlay(id: string): Promise<{ ok: true }> {
    const row = await this.overlays.findOneBy({ id });
    if (!row) throw new NotFoundException('Overlay not found');
    await this.overlays.delete({ id });
    await this.auditService.write({
      action: 'overlay.delete',
      resource: id,
      details: row.label,
      result: 'success',
    });
    return { ok: true };
  }

  async updateBackground(input: {
    name: string;
    cssBackground?: string | null;
    imageUrl?: string | null;
  }): Promise<BackgroundDisplay> {
    const name = input.name.trim();
    if (!name) throw new BadRequestException('Background name is required');
    const row = await this.activeBackground();
    row.name = name;
    row.cssBackground = input.cssBackground?.trim() || null;
    row.imageUrl = input.imageUrl?.trim() || null;
    const saved = await this.backgrounds.save(row);
    await this.auditService.write({
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
    return {
      row: input.row,
      col: input.col,
      label,
      style,
      isMotion: input.isMotion,
      requiresSafeAction: input.requiresSafeAction,
      primaryRegister,
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
  primaryRegisterId: string;
  feedbackRegisterId?: string | null;
  statusRegisterId?: string | null;
}

interface OverlayInput {
  label: string;
  xPct: number;
  yPct: number;
  format: string;
  registerId?: string | null;
}
