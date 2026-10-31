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
      const safety = await this.safetyState.tick();
      this.gateway.broadcast(WS_EVENTS.SAFETY_STATE, safety);
      this.gateway.broadcast(
        WS_EVENTS.CONNECTION_HEALTH,
        this.plcService.health(),
      );

      const driver = this.plcService.getDriver();
      if (!driver.isConnected()) return;

      const [height] = await driver.readHoldingRegisters(
        DEMO_CRANE_MAP.holdings.hoistHeightMm,
        1,
      );
      const [loadKg] = await driver.readHoldingRegisters(
        DEMO_CRANE_MAP.holdings.loadKg,
        1,
      );
      const [speed] = await driver.readHoldingRegisters(
        DEMO_CRANE_MAP.holdings.speedPct,
        1,
      );
      const discretes = await driver.readDiscreteInputs(
        DEMO_CRANE_MAP.discretes.motorRunning,
        3,
      );

      this.gateway.broadcast(WS_EVENTS.TAGS_UPDATE, {
        hoistHeightMm: height ?? 0,
        loadKg: loadKg ?? 0,
        speedPct: speed ?? 0,
        motorRunning: Boolean(discretes[0]),
        fault: Boolean(discretes[1]),
        commsOk: Boolean(discretes[2]),
        at: new Date().toISOString(),
      });

      await this.alarms.evaluate();

      this.tick += 1;
      if (this.tick % 4 === 0) {
        await this.trends.record('hoistHeightMm', height ?? 0);
        await this.trends.record('loadKg', loadKg ?? 0);
      }
    } catch (err) {
      this.logger.debug(
        `poll error: ${err instanceof Error ? err.message : 'unknown'}`,
      );
    }
  }
}
