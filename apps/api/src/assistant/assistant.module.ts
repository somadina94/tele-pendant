import { Module, forwardRef } from '@nestjs/common';
import { AlarmsModule } from '../alarms/alarms.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './providers/assistant.service';

@Module({
  imports: [forwardRef(() => AlarmsModule), forwardRef(() => RealtimeModule)],
  controllers: [AssistantController],
  providers: [AssistantService],
  exports: [AssistantService],
})
export class AssistantModule {}
