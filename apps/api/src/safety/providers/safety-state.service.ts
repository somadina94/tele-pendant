import { ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DEMO_CRANE_MAP } from '@tele-pendant/modbus-core';
import { Repository } from 'typeorm';
import { AuditService } from '../../audit/providers/audit.service';
import { Cell } from '../../cells/entities/cell.entity';
import { PlcService } from '../../plc/providers/plc.service';
import { RegisterMap } from '../../registers/entities/register-map.entity';
import { AuditActor, auditWriteFields } from '../../common/audit-actor';
import { SafeActionPinService } from '../../users/providers/safe-action-pin.service';
import { SafetyRoles } from '../entities/safety-roles.entity';

export type SafetyMode = 'normal' | 'safe_state' | 'e_stop' | 'comms_lost';

export interface SafetySnapshot {
  mode: SafetyMode;
  deadmanActive: boolean;
  eStopActive: boolean;
  watchdogOk: boolean;
  allowTimedMediaMotion: boolean;
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
  /** Authenticated holder of the software deadman (TP-37). */
  private deadmanHolderUserId: string | null = null;
  private deadmanHolderSocketId: string | null = null;
  /** After release/timeout: keep retrying PLC drop until deadman+motion coils are cleared. */
  private needsMotionDrop = false;
  private readonly watchdogTimeoutMs = 2000;
  private readonly deadmanTimeoutMs = 1500;
  private allowTimedMedia = false;

  private readonly plcService: PlcService;
  private readonly auditService: AuditService;
  private readonly cells: Repository<Cell>;
  private readonly registers: Repository<RegisterMap>;
  private readonly roles: Repository<SafetyRoles>;
  private readonly safeActionPin: SafeActionPinService;

  constructor(
    @Inject(PlcService) plcService: PlcService,
    @Inject(AuditService) auditService: AuditService,
    @InjectRepository(Cell) cells: Repository<Cell>,
    @InjectRepository(RegisterMap) registers: Repository<RegisterMap>,
    @InjectRepository(SafetyRoles) roles: Repository<SafetyRoles>,
    @Inject(SafeActionPinService) safeActionPin: SafeActionPinService,
  ) {
    this.plcService = plcService;
    this.auditService = auditService;
    this.cells = cells;
    this.registers = registers;
    this.roles = roles;
    this.safeActionPin = safeActionPin;
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
    allowTimedMediaMotion?: boolean;
  }): Promise<SafetyRoles> {
    const row = await this.getRoles();
    row.eStopRegisterId = input.eStopRegisterId || null;
    row.deadmanRegisterId = input.deadmanRegisterId || null;
    row.heartbeatRegisterId = input.heartbeatRegisterId || null;
    row.safeStateRegisterId = input.safeStateRegisterId || null;
    if (input.allowTimedMediaMotion !== undefined) {
      row.allowTimedMediaMotion = input.allowTimedMediaMotion;
      this.allowTimedMedia = input.allowTimedMediaMotion;
    }
    return this.roles.save(row);
  }

  async allowTimedMediaMotion(): Promise<boolean> {
    const row = await this.getRoles();
    this.allowTimedMedia = Boolean(row.allowTimedMediaMotion);
    return this.allowTimedMedia;
  }

  /**
   * Drop the software e-stop coil. Requires the signed-in user's reset PIN
   * (or plant SAFE_ACTION_PIN fallback until they set a personal PIN).
   * Asserting STOP itself does not use the PIN.
   */
  async resetEStop(pin: string, actor?: AuditActor): Promise<SafetySnapshot> {
    const ok = await this.safeActionPin.verify(actor?.userId, pin);
    if (!ok) {
      await this.auditService.write({
        ...auditWriteFields(actor),
        action: 'safety.reset_denied',
        resource: 'e-stop',
        result: 'failure',
      });
      throw new ForbiddenException('PIN does not match');
    }
    const driver = this.plcService.getDriver();
    const address = await this.roleAddress(
      'eStopRegisterId',
      'coil.eStop',
      DEMO_CRANE_MAP.coils.eStop,
    );
    if (driver.isConnected()) {
      await driver.writeCoil(address, false);
    }
    this.eStopActive = false;
    if (this.mode === 'e_stop') this.mode = 'normal';
    await this.auditService.write({
      ...auditWriteFields(actor),
      action: 'safety.reset',
      resource: 'e-stop',
      result: 'success',
    });
    return this.snapshot();
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
      allowTimedMediaMotion: this.allowTimedMedia,
      lastHeartbeatAt: this.lastHeartbeatAt?.toISOString() ?? null,
      lastClientPulseAt: this.lastClientPulseAt?.toISOString() ?? null,
    };
  }

  /**
   * Client must call while holding deadman. Holder is the signed-in user
   * (and optional socket) so another session cannot ride the pulse (TP-37).
   */
  pulseDeadman(holder: { userId: string; socketId?: string | null }): void {
    const userId = holder.userId?.trim();
    if (!userId) return;
    this.lastClientPulseAt = new Date();
    this.deadmanActive = true;
    this.deadmanHolderUserId = userId;
    this.deadmanHolderSocketId = holder.socketId?.trim() || null;
    this.needsMotionDrop = false;
  }

  /**
   * End deadman hold. Clears in-memory flags and drops PLC deadman + motion coils
   * on the server so a lost client coil-off cannot leave the hoist running (TP-35).
   * Only the holder (or force) can release so one client disconnect does not
   * clear another operator's hold (TP-37).
   */
  async releaseDeadman(opts?: {
    userId?: string | null;
    socketId?: string | null;
    force?: boolean;
  }): Promise<SafetySnapshot> {
    if (!opts?.force && this.deadmanActive) {
      const bySocket =
        opts?.socketId &&
        this.deadmanHolderSocketId &&
        opts.socketId === this.deadmanHolderSocketId;
      const byUser =
        opts?.userId &&
        this.deadmanHolderUserId &&
        opts.userId === this.deadmanHolderUserId;
      if (!bySocket && !byUser) {
        return this.snapshot();
      }
    }
    this.clearDeadmanHolder();
    this.needsMotionDrop = true;
    await this.dropMotionAndDeadmanCoil();
    return this.snapshot();
  }

  private clearDeadmanHolder(): void {
    this.deadmanActive = false;
    this.lastClientPulseAt = null;
    this.deadmanHolderUserId = null;
    this.deadmanHolderSocketId = null;
  }

  /**
   * Write deadman coil false and clear all motion coils. Retried from tick()
   * while needsMotionDrop remains set.
   */
  private async dropMotionAndDeadmanCoil(): Promise<void> {
    const driver = this.plcService.getDriver();
    if (!driver.isConnected()) return;
    try {
      const deadman = await this.roleAddress(
        'deadmanRegisterId',
        'coil.deadman',
        DEMO_CRANE_MAP.coils.deadman,
      );
      await driver.writeCoil(deadman, false);
      await this.clearMotionCoils();
      this.needsMotionDrop = false;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Deadman/motion drop failed (will retry): ${message}`);
    }
  }

  /** Motion only for the user who currently holds deadman (TP-37). */
  canIssueMotion(userId?: string | null): boolean {
    if (!userId || userId !== this.deadmanHolderUserId) return false;
    return (
      this.mode === 'normal' &&
      this.deadmanActive &&
      !this.eStopActive &&
      this.watchdogOk
    );
  }

  /** Latch software e-stop after operator STOP until resetEStop(). */
  async latchOperatorEStop(reason = 'Operator STOP'): Promise<SafetySnapshot> {
    this.eStopActive = true;
    await this.enterMode('e_stop', reason);
    return this.snapshot();
  }

  async tick(): Promise<SafetySnapshot> {
    const driver = this.plcService.getDriver();
    if (!driver.isConnected()) {
      this.eStopActive = false;
      await this.enterMode('comms_lost', 'PLC disconnected');
      return this.snapshot();
    }

    try {
      const roles = await this.getRoles();
      this.allowTimedMedia = Boolean(roles.allowTimedMediaMotion);
      const eStopAddress = await this.roleAddress(
        'eStopRegisterId',
        'coil.eStop',
        DEMO_CRANE_MAP.coils.eStop,
      );
      const coils = await driver.readCoils(eStopAddress, 1);
      const coilHigh = Boolean(coils[0]);
      this.eStopActive = coilHigh || this.mode === 'e_stop';
      if (coilHigh) {
        await this.enterMode('e_stop', 'E-stop coil asserted');
        return this.snapshot();
      }
      if (this.mode === 'e_stop') {
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

      // Deadman expiry (lost pulses) or pending drop after explicit release
      if (
        this.lastClientPulseAt &&
        Date.now() - this.lastClientPulseAt.getTime() > this.deadmanTimeoutMs
      ) {
        this.clearDeadmanHolder();
        this.needsMotionDrop = true;
      }
      if (this.needsMotionDrop) {
        await this.dropMotionAndDeadmanCoil();
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
