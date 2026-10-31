import { Inject, Injectable } from '@nestjs/common';
import { PlcService } from '../../plc/providers/plc.service';
import { SafetyStateService } from '../../safety/providers/safety-state.service';

@Injectable()
export class DiagnosticsService {
  constructor(
    @Inject(PlcService) private readonly plcService: PlcService,
    @Inject(SafetyStateService)
    private readonly safetyState: SafetyStateService,
  ) {}

  snapshot() {
    return {
      plc: this.plcService.health(),
      safety: this.safetyState.snapshot(),
      uptimeSec: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
