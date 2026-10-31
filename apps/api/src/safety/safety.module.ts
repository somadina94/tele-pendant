import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PlcModule } from '../plc/plc.module';
import { SafetyController } from './safety.controller';
import { SafetyStateService } from './providers/safety-state.service';

@Module({
  imports: [PlcModule, AuditModule],
  controllers: [SafetyController],
  providers: [SafetyStateService],
  exports: [SafetyStateService],
})
export class SafetyModule {}
