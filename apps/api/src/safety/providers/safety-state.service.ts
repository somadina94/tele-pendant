import { ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DEMO_CRANE_MAP } from '@tele-pendant/modbus-core';
import { Repository } from 'typeorm';
import { AuditService } from '../../audit/providers/audit.service';
import { Cell } from '../../cells/entities/cell.entity';
import { PlcService } from '../../plc/providers/plc.service';
import { RegisterMap } from '../../registers/entities/register-map.entity';
import { AuditActor, auditWriteFields } from '../../common/audit-actor';
import { motionDebug } from '../../common/motion-debug';
import { SafeActionPinService } from '../../users/providers/safe-action-pin.service';
import { SafetyRoles } from '../entities/safety-roles.entity';
import {
  ControlLeaseService,
  type ControlLeaseView,
} from './control-lease.service';

export type SafetyMode = 'normal' | 'safe_state' | 'e_stop' | 'comms_lost';

export interface SafetySnapshot {
  mode: SafetyMode;
  deadmanActive: boolean;
  eStopActive: boolean;
  watchdogOk: boolean;
  allowTimedMediaMotion: boolean;
  lastHeartbeatAt: string | null;
  lastClientPulseAt: string | null;
  /** FEAT-A5 exclusive Operator control lease. */
  control: ControlLeaseView;
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
  /** Bumped on pulse so an in-flight coil-drop cannot clear after a newer hold. */
  private dropGeneration = 0;
  /** Avoid rewriting deadman=true every 250ms while the hold is already asserted. */
  private deadmanCoilHigh = false;
  /** Motion coils asserted via activate — clear only these on release (not every cell). */
  private assertedMotionCoils = new Set<number>();
  private readonly watchdogTimeoutMs = 2000;
  /** Missed client pulses before motion drop (tight; WS pulse every 400ms). */
  private readonly deadmanTimeoutMs = 2500;
  /**
   * Transient Modbus timeouts must not clear motion coils (that freezes live
   * height/trolley until the next press). Require consecutive tick failures.
   */
  private readonly commsFailThreshold = 3;
  private consecutiveCommsFails = 0;
  private allowTimedMedia = false;

  private readonly plcService: PlcService;
  private readonly auditService: AuditService;
  private readonly cells: Repository<Cell>;
  private readonly registers: Repository<RegisterMap>;
  private readonly roles: Repository<SafetyRoles>;
  private readonly safeActionPin: SafeActionPinService;
  private readonly controlLease: ControlLeaseService;

  constructor(
    @Inject(PlcService) plcService: PlcService,
    @Inject(AuditService) auditService: AuditService,
    @InjectRepository(Cell) cells: Repository<Cell>,
    @InjectRepository(RegisterMap) registers: Repository<RegisterMap>,
    @InjectRepository(SafetyRoles) roles: Repository<SafetyRoles>,
    @Inject(SafeActionPinService) safeActionPin: SafeActionPinService,
    @Inject(ControlLeaseService) controlLease: ControlLeaseService,
  ) {
    this.plcService = plcService;
    this.auditService = auditService;
    this.cells = cells;
    this.registers = registers;
    this.roles = roles;
    this.safeActionPin = safeActionPin;
    this.controlLease = controlLease;
  }

  async getRoles(): Promise<SafetyRoles> {
    const existing = await this.roles.find({ take: 1 });
    if (existing[0]) return existing[0];
    return this.roles.save(this.roles.create({}));
  }

  /**
   * TP-42: changing safety role bindings (incl. timed media motion) requires the
   * signed-in user's reset PIN and is always audited.
   */
  async saveRoles(
    input: {
      eStopRegisterId?: string | null;
      deadmanRegisterId?: string | null;
      heartbeatRegisterId?: string | null;
      safeStateRegisterId?: string | null;
      allowTimedMediaMotion?: boolean;
      pin: string;
    },
    actor?: AuditActor,
  ): Promise<SafetyRoles> {
    const ok = await this.safeActionPin.verify(actor?.userId, input.pin);
    if (!ok) {
      await this.auditService.write({
        ...auditWriteFields(actor),
        action: 'safety.roles_denied',
        resource: 'safety_roles',
        result: 'failure',
      });
      throw new ForbiddenException('PIN does not match');
    }

    const row = await this.getRoles();
    row.eStopRegisterId = input.eStopRegisterId || null;
    row.deadmanRegisterId = input.deadmanRegisterId || null;
    row.heartbeatRegisterId = input.heartbeatRegisterId || null;
    row.safeStateRegisterId = input.safeStateRegisterId || null;
    if (input.allowTimedMediaMotion !== undefined) {
      row.allowTimedMediaMotion = input.allowTimedMediaMotion;
      this.allowTimedMedia = input.allowTimedMediaMotion;
    }
    const saved = await this.roles.save(row);
    const label = async (id: string | null | undefined) => {
      if (!id) return '';
      const reg = await this.registers.findOneBy({ id });
      return reg?.name ?? id;
    };
    // TP-10: audit details use register names, not raw UUIDs.
    await this.auditService.write({
      ...auditWriteFields(actor),
      action: 'safety.roles_update',
      resource: 'safety_roles',
      details: [
        `allowTimedMediaMotion=${Boolean(saved.allowTimedMediaMotion)}`,
        `eStop=${await label(saved.eStopRegisterId)}`,
        `deadman=${await label(saved.deadmanRegisterId)}`,
        `heartbeat=${await label(saved.heartbeatRegisterId)}`,
        `safeState=${await label(saved.safeStateRegisterId)}`,
      ].join(';'),
      result: 'success',
    });
    return saved;
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

  snapshot(
    forUserId?: string | null,
    forClientId?: string | null,
  ): SafetySnapshot {
    return {
      mode: this.mode,
      deadmanActive: this.deadmanActive,
      eStopActive: this.eStopActive,
      watchdogOk: this.watchdogOk,
      allowTimedMediaMotion: this.allowTimedMedia,
      lastHeartbeatAt: this.lastHeartbeatAt?.toISOString() ?? null,
      lastClientPulseAt: this.lastClientPulseAt?.toISOString() ?? null,
      control: this.controlLease.snapshot(forUserId, forClientId),
    };
  }

  controlSnapshot(
    forUserId?: string | null,
    forClientId?: string | null,
  ): ControlLeaseView {
    return this.controlLease.snapshot(forUserId, forClientId);
  }

  claimControl(
    userId: string,
    displayName?: string | null,
    actor?: AuditActor,
    clientId?: string | null,
  ): ControlLeaseView {
    const control = this.controlLease.claim(userId, displayName, clientId);
    void this.auditService.write({
      ...auditWriteFields(actor),
      action: 'safety.control_claim',
      resource: 'control_lease',
      result: 'success',
    });
    return control;
  }

  heartbeatControl(userId: string, clientId?: string | null): ControlLeaseView {
    return this.controlLease.heartbeat(userId, clientId);
  }

  releaseControl(
    userId: string,
    actor?: AuditActor,
    clientId?: string | null,
  ): ControlLeaseView {
    const control = this.controlLease.release(userId, clientId);
    void this.auditService.write({
      ...auditWriteFields(actor),
      action: 'safety.control_release',
      resource: 'control_lease',
      result: 'success',
    });
    return control;
  }

  /**
   * Take exclusive control from another holder. Requires reset PIN (FEAT-A5).
   * Drops the previous holder's deadman so motion cannot continue mid-steal.
   */
  async stealControl(
    pin: string,
    userId: string,
    displayName?: string | null,
    actor?: AuditActor,
    clientId?: string | null,
  ): Promise<ControlLeaseView> {
    const ok = await this.safeActionPin.verify(userId, pin);
    if (!ok) {
      await this.auditService.write({
        ...auditWriteFields(actor),
        action: 'safety.control_steal_denied',
        resource: 'control_lease',
        result: 'failure',
      });
      throw new ForbiddenException('PIN does not match');
    }
    const { control, previousUserId } = this.controlLease.steal(
      userId,
      displayName,
      clientId,
    );
    if (previousUserId) {
      await this.releaseDeadman({ userId: previousUserId, force: true });
    }
    await this.auditService.write({
      ...auditWriteFields(actor),
      action: 'safety.control_steal',
      resource: 'control_lease',
      details: previousUserId ? `from=${previousUserId}` : undefined,
      result: 'success',
    });
    return control;
  }

  /**
   * Client must call while holding deadman. Holder is the signed-in user
   * (and optional socket) so another session cannot ride the pulse (TP-37).
   * FEAT-A5: pulses are ignored unless the user holds the control lease.
   */
  pulseDeadman(holder: {
    userId: string;
    socketId?: string | null;
    clientId?: string | null;
  }): void {
    const userId = holder.userId?.trim();
    if (!userId) return;
    if (!this.controlLease.holds(userId, holder.clientId)) {
      motionDebug('deadman.pulse.rejected', {
        userId,
        reason: 'no-control-lease',
        via: holder.socketId ? 'ws' : 'http',
      });
      return;
    }
    const freshHold = !this.deadmanActive;
    this.lastClientPulseAt = new Date();
    this.deadmanActive = true;
    this.deadmanHolderUserId = userId;
    const socketId = holder.socketId?.trim() || null;
    // HTTP pulses omit socketId — keep the WS binding so reconnect matching stays stable.
    this.deadmanHolderSocketId = socketId || this.deadmanHolderSocketId;
    this.needsMotionDrop = false;
    this.dropGeneration += 1;
    // Re-assert PLC deadman only when a hold starts (not every 400ms pulse).
    if (freshHold) this.deadmanCoilHigh = false;
    motionDebug('deadman.pulse.ok', {
      userId,
      socketId: this.deadmanHolderSocketId,
      via: socketId ? 'ws' : 'http',
      dropGeneration: this.dropGeneration,
      msSinceEpoch: this.lastClientPulseAt.getTime(),
    });
  }

  /**
   * Socket.io flap mid-hold: drop the socket binding only. HTTP deadman pulses
   * keep motion alive; true loss still expires via deadmanTimeoutMs (TP-35).
   */
  noteSocketDisconnect(socketId: string): void {
    const id = socketId?.trim();
    if (!id || this.deadmanHolderSocketId !== id) return;
    this.deadmanHolderSocketId = null;
    motionDebug('deadman.socket-unbound', { socketId: id });
  }

  /**
   * End deadman hold. Clears in-memory flags and drops PLC deadman + motion coils
   * on the server so a lost client coil-off cannot leave the hoist running (TP-35).
   * Only the holder (or force) can release so one client disconnect does not
   * clear another operator's hold (TP-37).
   */
  /** Track a motion coil written true so release only clears what was asserted. */
  noteMotionCoilAsserted(address: number): void {
    if (Number.isFinite(address)) this.assertedMotionCoils.add(address);
  }

  noteMotionCoilCleared(address: number): void {
    this.assertedMotionCoils.delete(address);
  }

  releaseDeadman(opts?: {
    userId?: string | null;
    socketId?: string | null;
    force?: boolean;
  }): Promise<SafetySnapshot> {
    // WS + HTTP both call release — second call must not re-run a 6+ coil drop.
    if (!this.deadmanActive && !opts?.force) {
      return Promise.resolve(this.snapshot());
    }
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
        return Promise.resolve(this.snapshot());
      }
    }
    motionDebug('deadman.release', {
      userId: opts?.userId ?? null,
      socketId: opts?.socketId ?? null,
      force: Boolean(opts?.force),
      assertedCoils: this.assertedMotionCoils.size,
    });
    this.clearDeadmanHolder();
    this.needsMotionDrop = true;
    // Do not block the WS/HTTP response on the full Modbus drop — tick retries.
    void this.dropMotionAndDeadmanCoil();
    return Promise.resolve(this.snapshot());
  }

  private clearDeadmanHolder(): void {
    this.deadmanActive = false;
    this.lastClientPulseAt = null;
    this.deadmanHolderUserId = null;
    this.deadmanHolderSocketId = null;
    this.deadmanCoilHigh = false;
  }

  /**
   * Write deadman coil false and clear all motion coils. Retried from tick()
   * while needsMotionDrop remains set. Aborts if a newer pulse arrived mid-drop.
   */
  private async dropMotionAndDeadmanCoil(): Promise<void> {
    const driver = this.plcService.getDriver();
    if (!driver.isConnected()) return;
    const gen = this.dropGeneration;
    try {
      const deadman = await this.roleAddress(
        'deadmanRegisterId',
        'coil.deadman',
        DEMO_CRANE_MAP.coils.deadman,
      );
      await driver.writeCoil(deadman, false);
      if (gen !== this.dropGeneration || !this.needsMotionDrop) return;
      await this.clearMotionCoils();
      if (gen !== this.dropGeneration || !this.needsMotionDrop) return;
      this.needsMotionDrop = false;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Deadman/motion drop failed (will retry): ${message}`);
    }
  }

  /**
   * Motion only for the exclusive control holder who also holds deadman
   * (TP-37 + FEAT-A5).
   */
  /** Exclusive control only. Non-motion buttons use this; motion also needs deadman. */
  holdsControl(userId?: string | null, clientId?: string | null): boolean {
    return this.controlLease.holds(userId, clientId);
  }

  canIssueMotion(userId?: string | null, clientId?: string | null): boolean {
    if (!userId || !this.controlLease.holds(userId, clientId)) return false;
    if (userId !== this.deadmanHolderUserId) return false;
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
      this.consecutiveCommsFails += 1;
      // TP-39: never clear the software e-stop latch on comms loss.
      if (this.consecutiveCommsFails >= this.commsFailThreshold) {
        await this.enterMode('comms_lost', 'PLC disconnected');
      } else {
        this.watchdogOk = false;
        this.logger.debug(
          `PLC disconnected (fail ${this.consecutiveCommsFails}/${this.commsFailThreshold})`,
        );
      }
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
      // Latch sticks until resetEStop (PIN); coil high also asserts it.
      this.eStopActive = this.eStopActive || coilHigh;
      if (coilHigh) {
        this.consecutiveCommsFails = 0;
        await this.enterMode('e_stop', 'E-stop coil asserted');
        return this.snapshot();
      }
      if (this.eStopActive) {
        // Re-assert e_stop after reconnect / coil drop until PIN reset (TP-39).
        this.consecutiveCommsFails = 0;
        if (this.mode !== 'e_stop') {
          await this.enterMode('e_stop', 'Software e-stop still latched');
        }
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
      this.consecutiveCommsFails = 0;

      // Deadman expiry (lost pulses) or pending drop after explicit release.
      if (
        this.deadmanActive &&
        this.lastClientPulseAt &&
        Date.now() - this.lastClientPulseAt.getTime() > this.deadmanTimeoutMs
      ) {
        const ageMs = Date.now() - this.lastClientPulseAt.getTime();
        motionDebug('deadman.timeout-drop', {
          ageMs,
          timeoutMs: this.deadmanTimeoutMs,
          holderUserId: this.deadmanHolderUserId,
          holderSocketId: this.deadmanHolderSocketId,
        });
        this.clearDeadmanHolder();
        this.needsMotionDrop = true;
      }
      if (this.needsMotionDrop) {
        motionDebug('deadman.coil-drop-run', {
          dropGeneration: this.dropGeneration,
        });
        this.deadmanCoilHigh = false;
        await this.dropMotionAndDeadmanCoil();
      } else if (this.deadmanActive && !this.deadmanCoilHigh) {
        const deadman = await this.roleAddress(
          'deadmanRegisterId',
          'coil.deadman',
          DEMO_CRANE_MAP.coils.deadman,
        );
        await driver.writeCoil(deadman, true);
        this.deadmanCoilHigh = true;
      }

      if (this.mode !== 'normal' && !this.eStopActive) {
        this.mode = 'normal';
      }
    } catch (err) {
      this.consecutiveCommsFails += 1;
      this.watchdogOk = false;
      const message = err instanceof Error ? err.message : 'watchdog failure';
      if (this.consecutiveCommsFails >= this.commsFailThreshold) {
        await this.enterMode('comms_lost', message);
      } else {
        this.logger.debug(
          `PLC tick fail ${this.consecutiveCommsFails}/${this.commsFailThreshold}: ${message}`,
        );
      }
    }

    return this.snapshot();
  }

  private async clearMotionCoils(): Promise<void> {
    const driver = this.plcService.getDriver();
    if (!driver.isConnected()) return;
    // Prefer the coils we actually asserted this hold (1 write vs scanning all).
    if (this.assertedMotionCoils.size > 0) {
      const addrs = [...this.assertedMotionCoils];
      this.assertedMotionCoils.clear();
      for (const address of addrs) {
        await driver.writeCoil(address, false);
      }
      return;
    }
    const motion = await this.cells.find({
      where: { isMotion: true },
      relations: { primaryRegister: true, secondaryRegister: true },
    });
    for (const cell of motion) {
      for (const reg of [cell.primaryRegister, cell.secondaryRegister]) {
        if (reg?.kind === 'coil') {
          await driver.writeCoil(reg.address, false);
        }
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
