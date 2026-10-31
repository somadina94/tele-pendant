import { Module } from '@nestjs/common';
import { PlcModule } from '../plc/plc.module';
import { SafetyModule } from '../safety/safety.module';
import { DiagnosticsController } from './diagnostics.controller';
import { DiagnosticsService } from './providers/diagnostics.service';

@Module({
  imports: [PlcModule, SafetyModule],
  controllers: [DiagnosticsController],
  providers: [DiagnosticsService],
})
export class DiagnosticsModule {}
