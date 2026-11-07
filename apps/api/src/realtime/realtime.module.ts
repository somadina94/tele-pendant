import { Module, forwardRef } from '@nestjs/common';
import { AlarmsModule } from '../alarms/alarms.module';
import { AuthModule } from '../auth/auth.module';
import { PlcModule } from '../plc/plc.module';
import { SafetyModule } from '../safety/safety.module';
import { TrendsModule } from '../trends/trends.module';
import { TagPollerService } from './providers/tag-poller.service';
import { RealtimeGateway } from './realtime.gateway';

@Module({
  imports: [
    AuthModule,
    PlcModule,
    SafetyModule,
    TrendsModule,
    forwardRef(() => AlarmsModule),
  ],
  providers: [RealtimeGateway, TagPollerService],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
