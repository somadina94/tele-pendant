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

@Injectable()
export class TagPollerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TagPollerService.name);
  private timer: NodeJS.Timeout | null = null;
  private tick = 0;

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

  private async poll(): Promise<void> {
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

      const heightAddr = await this.plcService.addressFor(
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
      const [height] = await driver.readHoldingRegisters(heightAddr, 1);
      const [loadKg] = await driver.readHoldingRegisters(loadAddr, 1);
      const [speed] = await driver.readHoldingRegisters(speedAddr, 1);
      const [motorRunning] = await driver.readDiscreteInputs(motorAddr, 1);
      const [fault] = await driver.readDiscreteInputs(faultAddr, 1);
      const [commsOk] = await driver.readDiscreteInputs(commsAddr, 1);
      const values = await this.plcService.readNamedValues();

      this.gateway.broadcast(WS_EVENTS.TAGS_UPDATE, {
        hoistHeightMm: height ?? 0,
        loadKg: loadKg ?? 0,
        speedPct: speed ?? 0,
        motorRunning: Boolean(motorRunning),
        fault: Boolean(fault),
        commsOk: Boolean(commsOk),
        values,
        at: new Date().toISOString(),
      });

      await this.alarms.evaluate();

      this.tick += 1;
      if (this.tick % 4 === 0) {
        const series = await this.plcService.trendedSamples();
        for (const sample of series) {
          await this.trends.record(sample.key, sample.value);
        }
      }
    } catch (err) {
      this.logger.debug(
        `poll error: ${err instanceof Error ? err.message : 'unknown'}`,
      );
    }
  }
}
