import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { DEMO_CRANE_MAP } from '@tele-pendant/modbus-core';
import { WS_EVENTS } from '@tele-pendant/shared';
import { AlarmEngineService } from '../../alarms/providers/alarm-engine.service';
import { PlcService } from '../../plc/providers/plc.service';
import { SafetyStateService } from '../../safety/providers/safety-state.service';
import { TrendsService } from '../../trends/providers/trends.service';
import { RealtimeGateway } from '../realtime.gateway';

export type LiveTagSnapshot = {
  hoistHeightMm: number;
  loadKg: number;
  speedPct: number;
  trolleyPositionMm: number;
  motorRunning: boolean;
  fault: boolean;
  commsOk: boolean;
  values: Record<string, number | boolean>;
  /** Increments every successful poll (strict ordering for Operator merge). */
  seq: number;
  at: string;
};

@Injectable()
export class TagPollerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TagPollerService.name);
  private timer: NodeJS.Timeout | null = null;
  private tick = 0;
  private seq = 0;
  /** Skip overlapping polls — prod Modbus RTT otherwise stacks reads and stalls live tags. */
  private inFlight = false;
  private lastTags: LiveTagSnapshot | null = null;

  constructor(
    @Inject(PlcService) private readonly plcService: PlcService,
    @Inject(SafetyStateService)
    private readonly safetyState: SafetyStateService,
    @Inject(RealtimeGateway) private readonly gateway: RealtimeGateway,
    @Inject(AlarmEngineService) private readonly alarms: AlarmEngineService,
    @Inject(TrendsService) private readonly trends: TrendsService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.poll();
    }, 250);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Last broadcast payload — used by GET /realtime/tags when WS is laggy in prod. */
  latest(): LiveTagSnapshot | { at: null } {
    return this.lastTags ?? { at: null };
  }

  private async poll(): Promise<void> {
    if (this.inFlight) return;
    this.inFlight = true;
    try {
      await this.plcService.reconnectIfNeeded();
      const safety = await this.safetyState.tick();
      this.gateway.broadcast(WS_EVENTS.SAFETY_STATE, safety);
      this.gateway.broadcast(
        WS_EVENTS.CONNECTION_HEALTH,
        this.plcService.health(),
      );

      const driver = this.plcService.getDriver();
      if (!driver.isConnected()) return;

      const hoistAddr = await this.plcService.addressFor(
        'holding.hoistHeightMm',
        DEMO_CRANE_MAP.holdings.hoistHeightMm,
      );
      const loadAddr = await this.plcService.addressFor(
        'holding.loadKg',
        DEMO_CRANE_MAP.holdings.loadKg,
      );
      const speedAddr = await this.plcService.addressFor(
        'holding.speedPct',
        DEMO_CRANE_MAP.holdings.speedPct,
      );
      const trolleyAddr = await this.plcService.addressFor(
        'holding.trolleyPosition',
        DEMO_CRANE_MAP.holdings.trolleyPosition,
      );
      const motorAddr = await this.plcService.addressFor(
        'discrete.motorRunning',
        DEMO_CRANE_MAP.discretes.motorRunning,
      );
      const faultAddr = await this.plcService.addressFor(
        'discrete.fault',
        DEMO_CRANE_MAP.discretes.fault,
      );
      const commsAddr = await this.plcService.addressFor(
        'discrete.commsOk',
        DEMO_CRANE_MAP.discretes.commsOk,
      );
      // Batch-read contiguous demo map blocks so serialized Modbus keeps up
      // with the 250ms poll (per-register reads were freezing then jumping).
      const holdingBase = Math.min(
        hoistAddr,
        loadAddr,
        speedAddr,
        trolleyAddr,
      );
      const holdingTop = Math.max(
        hoistAddr,
        loadAddr,
        speedAddr,
        trolleyAddr,
      );
      const holdingBlock = await driver.readHoldingRegisters(
        holdingBase,
        holdingTop - holdingBase + 1,
      );
      const pickHolding = (addr: number) =>
        holdingBlock[addr - holdingBase] ?? 0;
      const height = pickHolding(hoistAddr);
      const loadKg = pickHolding(loadAddr);
      const speed = pickHolding(speedAddr);
      const trolleyPosition = pickHolding(trolleyAddr);
      const discreteBase = Math.min(motorAddr, faultAddr, commsAddr);
      const discreteTop = Math.max(motorAddr, faultAddr, commsAddr);
      const discreteBlock = await driver.readDiscreteInputs(
        discreteBase,
        discreteTop - discreteBase + 1,
      );
      const pickDiscrete = (addr: number) =>
        Boolean(discreteBlock[addr - discreteBase]);
      const motorRunning = pickDiscrete(motorAddr);
      const fault = pickDiscrete(faultAddr);
      const commsOk = pickDiscrete(commsAddr);

      const coreValues: Record<string, number | boolean> = {
        'holding.hoistHeightMm': height ?? 0,
        'holding.loadKg': loadKg ?? 0,
        'holding.speedPct': speed ?? 0,
        'holding.trolleyPosition': trolleyPosition ?? 0,
        'discrete.motorRunning': motorRunning,
        'discrete.fault': fault,
        'discrete.commsOk': commsOk,
      };
      let values = {
        ...this.lastTags?.values,
        ...coreValues,
      };
      if (this.tick === 0 || this.tick % 8 === 0) {
        try {
          values = { ...values, ...(await this.plcService.readNamedValues()) };
        } catch {
          // keep coreValues-only snapshot
        }
      }

      this.seq += 1;
      const snapshot: LiveTagSnapshot = {
        hoistHeightMm: height ?? 0,
        loadKg: loadKg ?? 0,
        speedPct: speed ?? 0,
        trolleyPositionMm: trolleyPosition ?? 0,
        motorRunning,
        fault,
        commsOk,
        values,
        seq: this.seq,
        at: new Date().toISOString(),
      };
      this.lastTags = snapshot;
      this.gateway.broadcast(WS_EVENTS.TAGS_UPDATE, snapshot);

      await this.alarms.evaluate();

      this.tick += 1;
      if (this.tick === 1 || this.tick % 4 === 0) {
        const series = await this.plcService.trendedSamples();
        for (const sample of series) {
          await this.trends.record(sample.key, sample.value);
        }
      }
    } catch (err) {
      this.logger.debug(
        `poll error: ${err instanceof Error ? err.message : 'unknown'}`,
      );
    } finally {
      this.inFlight = false;
    }
  }
}
