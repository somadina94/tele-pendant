import {
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
      const expected =
        process.env.SAFE_ACTION_PIN || process.env.ADMIN_PASSWORD || '';
      if (!opts.safeActionPin || opts.safeActionPin !== expected) {
        await this.auditService.write({
          userId: opts.userId,
          userEmail: opts.userEmail,
          action: 'cell.safe_action_denied',
          resource: cell.id,
          ip: opts.ip,
          result: 'failure',
        });
        throw new ForbiddenException(
          'Safe-action authorization required (supervisor PIN)',
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
}
