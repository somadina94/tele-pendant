import { Inject, Injectable, Logger } from '@nestjs/common';
import { DEMO_CRANE_MAP } from '@tele-pendant/modbus-core';
import { AuditService } from '../../audit/providers/audit.service';
import { PlcService } from '../../plc/providers/plc.service';

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

  constructor(
    @Inject(PlcService) plcService: PlcService,
    @Inject(AuditService) auditService: AuditService,
  ) {
    this.plcService = plcService;
    this.auditService = auditService;
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
      await this.enterMode('comms_lost', 'PLC disconnected');
      return this.snapshot();
    }

    try {
      const coils = await driver.readCoils(DEMO_CRANE_MAP.coils.eStop, 1);
      this.eStopActive = Boolean(coils[0]);
      if (this.eStopActive) {
        await this.enterMode('e_stop', 'E-stop coil asserted');
        return this.snapshot();
      }

      // App heartbeat into PLC
      const beat = ((this.lastHeartbeatAt?.getTime() ?? 0) + 1) % 65535;
      await driver.writeRegister(DEMO_CRANE_MAP.holdings.heartbeat, beat);
      this.lastHeartbeatAt = new Date();
      this.watchdogOk = true;

      // Deadman expiry
      if (
        this.lastClientPulseAt &&
        Date.now() - this.lastClientPulseAt.getTime() > this.deadmanTimeoutMs
      ) {
        this.deadmanActive = false;
        await driver.writeCoil(DEMO_CRANE_MAP.coils.deadman, false);
        await this.clearMotionCoils();
      } else if (this.deadmanActive) {
        await driver.writeCoil(DEMO_CRANE_MAP.coils.deadman, true);
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
    const motion = [
      DEMO_CRANE_MAP.coils.hoistUp,
      DEMO_CRANE_MAP.coils.hoistDown,
      DEMO_CRANE_MAP.coils.trolleyLeft,
      DEMO_CRANE_MAP.coils.trolleyRight,
      DEMO_CRANE_MAP.coils.bridgeFwd,
      DEMO_CRANE_MAP.coils.bridgeRev,
    ];
    for (const address of motion) {
      await driver.writeCoil(address, false);
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
          await driver.writeRegister(DEMO_CRANE_MAP.holdings.safeState, 1);
          await driver.writeCoil(DEMO_CRANE_MAP.coils.deadman, false);
        }
      } catch {
        // best-effort safe-state writes
      }
    }
  }
}
