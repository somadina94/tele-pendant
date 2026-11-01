import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DEMO_CRANE_MAP } from '@tele-pendant/modbus-core';
import { Repository } from 'typeorm';
import { AuditService } from '../../audit/providers/audit.service';
import { Cell } from '../../cells/entities/cell.entity';
import { PlcService } from '../../plc/providers/plc.service';
import { RegisterMap } from '../../registers/entities/register-map.entity';
import { SafetyRoles } from '../entities/safety-roles.entity';

export type SafetyMode = 'normal' | 'safe_state' | 'e_stop' | 'comms_lost';

export interface SafetySnapshot {
  mode: SafetyMode;
  deadmanActive: boolean;
  eStopActive: boolean;
  watchdogOk: boolean;
  lastHeartbeatAt: string | null;
  lastClientPulseAt: string | null;
}

/**
 * Software safety supervision over Modbus (not a certified safety PLC).
 */
@Injectable()
export class SafetyStateService {
  private readonly logger = new Logger(SafetyStateService.name);
  private mode: SafetyMode = 'normal';
  private deadmanActive = false;
  private eStopActive = false;
  private watchdogOk = true;
  private lastHeartbeatAt: Date | null = null;
  private lastClientPulseAt: Date | null = null;
  private readonly watchdogTimeoutMs = 2000;
  private readonly deadmanTimeoutMs = 1500;

  private readonly plcService: PlcService;
  private readonly auditService: AuditService;
  private readonly cells: Repository<Cell>;
  private readonly registers: Repository<RegisterMap>;
  private readonly roles: Repository<SafetyRoles>;

  constructor(
    @Inject(PlcService) plcService: PlcService,
    @Inject(AuditService) auditService: AuditService,
    @InjectRepository(Cell) cells: Repository<Cell>,
    @InjectRepository(RegisterMap) registers: Repository<RegisterMap>,
    @InjectRepository(SafetyRoles) roles: Repository<SafetyRoles>,
  ) {
    this.plcService = plcService;
    this.auditService = auditService;
    this.cells = cells;
    this.registers = registers;
    this.roles = roles;
  }

  async getRoles(): Promise<SafetyRoles> {
    const existing = await this.roles.find({ take: 1 });
    if (existing[0]) return existing[0];
    return this.roles.save(this.roles.create({}));
  }

  async saveRoles(input: {
    eStopRegisterId?: string | null;
    deadmanRegisterId?: string | null;
    heartbeatRegisterId?: string | null;
    safeStateRegisterId?: string | null;
  }): Promise<SafetyRoles> {
    const row = await this.getRoles();
    row.eStopRegisterId = input.eStopRegisterId || null;
    row.deadmanRegisterId = input.deadmanRegisterId || null;
    row.heartbeatRegisterId = input.heartbeatRegisterId || null;
    row.safeStateRegisterId = input.safeStateRegisterId || null;
    return this.roles.save(row);
  }

  private async roleAddress(
    key:
      | 'eStopRegisterId'
      | 'deadmanRegisterId'
      | 'heartbeatRegisterId'
      | 'safeStateRegisterId',
    name: string,
    fallback: number,
  ): Promise<number> {
    const [row] = await this.roles.find({ take: 1 });
    const id = row?.[key];
    if (id) {
      const reg = await this.registers.findOneBy({ id });
      if (reg) return reg.address;
    }
    return this.plcService.addressFor(name, fallback);
  }

  snapshot(): SafetySnapshot {
    return {
      mode: this.mode,
      deadmanActive: this.deadmanActive,
      eStopActive: this.eStopActive,
      watchdogOk: this.watchdogOk,
      lastHeartbeatAt: this.lastHeartbeatAt?.toISOString() ?? null,
      lastClientPulseAt: this.lastClientPulseAt?.toISOString() ?? null,
    };
  }

  /** Client must call while holding deadman. */
  pulseDeadman(): void {
    this.lastClientPulseAt = new Date();
    this.deadmanActive = true;
  }

  releaseDeadman(): void {
    this.deadmanActive = false;
    this.lastClientPulseAt = null;
  }

  canIssueMotion(): boolean {
    return (
      this.mode === 'normal' &&
      this.deadmanActive &&
      !this.eStopActive &&
      this.watchdogOk
    );
  }

  async tick(): Promise<SafetySnapshot> {
    const driver = this.plcService.getDriver();
    if (!driver.isConnected()) {
      this.eStopActive = false;
      await this.enterMode('comms_lost', 'PLC disconnected');
      return this.snapshot();
    }

    try {
      const eStopAddress = await this.roleAddress(
        'eStopRegisterId',
        'coil.eStop',
        DEMO_CRANE_MAP.coils.eStop,
      );
      const coils = await driver.readCoils(eStopAddress, 1);
      this.eStopActive = Boolean(coils[0]);
      if (this.eStopActive) {
        await this.enterMode('e_stop', 'E-stop coil asserted');
        return this.snapshot();
      }

      // App heartbeat into PLC
      const beat = ((this.lastHeartbeatAt?.getTime() ?? 0) + 1) % 65535;
      const heartbeat = await this.roleAddress(
        'heartbeatRegisterId',
        'holding.heartbeat',
        DEMO_CRANE_MAP.holdings.heartbeat,
      );
      await driver.writeRegister(heartbeat, beat);
      this.lastHeartbeatAt = new Date();
      this.watchdogOk = true;

      // Deadman expiry
      if (
        this.lastClientPulseAt &&
        Date.now() - this.lastClientPulseAt.getTime() > this.deadmanTimeoutMs
      ) {
        this.deadmanActive = false;
        const deadman = await this.roleAddress(
          'deadmanRegisterId',
          'coil.deadman',
          DEMO_CRANE_MAP.coils.deadman,
        );
        await driver.writeCoil(deadman, false);
        await this.clearMotionCoils();
      } else if (this.deadmanActive) {
        const deadman = await this.roleAddress(
          'deadmanRegisterId',
          'coil.deadman',
          DEMO_CRANE_MAP.coils.deadman,
        );
        await driver.writeCoil(deadman, true);
      }

      if (this.mode !== 'normal' && !this.eStopActive) {
        this.mode = 'normal';
      }
    } catch (err) {
      this.watchdogOk = false;
      const message = err instanceof Error ? err.message : 'watchdog failure';
      await this.enterMode('comms_lost', message);
    }

    return this.snapshot();
  }

  private async clearMotionCoils(): Promise<void> {
    const driver = this.plcService.getDriver();
    if (!driver.isConnected()) return;
    const motion = await this.cells.find({
      where: { isMotion: true },
      relations: { primaryRegister: true },
    });
    for (const cell of motion) {
      const reg = cell.primaryRegister;
      if (reg?.kind === 'coil') {
        await driver.writeCoil(reg.address, false);
      }
    }
  }

  private async enterMode(mode: SafetyMode, reason: string): Promise<void> {
    if (this.mode === mode) return;
    this.mode = mode;
    this.logger.warn(`Safety mode → ${mode}: ${reason}`);
    await this.auditService.write({
      action: 'safety.mode',
      details: `${mode}: ${reason}`,
      result: mode === 'normal' ? 'success' : 'safe_state',
    });

    if (mode === 'comms_lost' || mode === 'safe_state' || mode === 'e_stop') {
      try {
        const driver = this.plcService.getDriver();
        if (driver.isConnected()) {
          await this.clearMotionCoils();
          const safeState = await this.roleAddress(
            'safeStateRegisterId',
            'holding.safeState',
            DEMO_CRANE_MAP.holdings.safeState,
          );
          const deadman = await this.roleAddress(
            'deadmanRegisterId',
            'coil.deadman',
            DEMO_CRANE_MAP.coils.deadman,
          );
          await driver.writeRegister(safeState, 1);
          await driver.writeCoil(deadman, false);
        }
      } catch {
        // best-effort safe-state writes
      }
    }
  }
}
