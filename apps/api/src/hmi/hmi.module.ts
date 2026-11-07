import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { BackgroundDisplay } from '../backgrounds/entities/background-display.entity';
import { Cell } from '../cells/entities/cell.entity';
import { OverlayLabel } from '../overlays/entities/overlay-label.entity';
import { PlcModule } from '../plc/plc.module';
import { RegisterMap } from '../registers/entities/register-map.entity';
import { SafetyRoles } from '../safety/entities/safety-roles.entity';
import { SafetyModule } from '../safety/safety.module';
import { UsersModule } from '../users/users.module';
import { HmiController } from './hmi.controller';
import { HmiSeedService } from './providers/hmi-seed.service';
import { HmiService } from './providers/hmi.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Cell,
      RegisterMap,
      BackgroundDisplay,
      OverlayLabel,
      SafetyRoles,
    ]),
    PlcModule,
    SafetyModule,
    UsersModule,
    AuditModule,
  ],
  controllers: [HmiController],
  providers: [HmiService, HmiSeedService],
  exports: [HmiService],
})
export class HmiModule {}
