import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlcModule } from '../plc/plc.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { RegisterMap } from '../registers/entities/register-map.entity';
import { AlarmsController } from './alarms.controller';
import { AlarmDefinition } from './entities/alarm-definition.entity';
import { AlarmEvent } from './entities/alarm-event.entity';
import { AlarmEngineService } from './providers/alarm-engine.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([AlarmDefinition, AlarmEvent, RegisterMap]),
    PlcModule,
    forwardRef(() => RealtimeModule),
  ],
  controllers: [AlarmsController],
  providers: [AlarmEngineService],
  exports: [AlarmEngineService],
})
export class AlarmsModule {}
