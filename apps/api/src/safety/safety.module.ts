import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { UsersModule } from '../users/users.module';
import { Cell } from '../cells/entities/cell.entity';
import { PlcModule } from '../plc/plc.module';
import { RegisterMap } from '../registers/entities/register-map.entity';
import { SafetyRoles } from './entities/safety-roles.entity';
import { SafetyController } from './safety.controller';
import { SafetyStateService } from './providers/safety-state.service';

@Module({
  imports: [
    PlcModule,
    AuditModule,
    UsersModule,
    TypeOrmModule.forFeature([Cell, RegisterMap, SafetyRoles]),
  ],
  controllers: [SafetyController],
  providers: [SafetyStateService],
  exports: [SafetyStateService],
})
export class SafetyModule {}
