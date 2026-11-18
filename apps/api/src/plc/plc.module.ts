import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { HmiModule } from '../hmi/hmi.module';
import { RegisterMap } from '../registers/entities/register-map.entity';
import { PlcConnection } from './entities/plc-connection.entity';
import { PlcController } from './plc.controller';
import { PlcService } from './providers/plc.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([PlcConnection, RegisterMap]),
    AuditModule,
    forwardRef(() => HmiModule),
  ],
  controllers: [PlcController],
  providers: [PlcService],
  exports: [PlcService],
})
export class PlcModule {}
