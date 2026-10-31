import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { HmiModule } from '../hmi/hmi.module';
import { SafetyModule } from '../safety/safety.module';
import { ScanCode } from './entities/scan-code.entity';
import { MediaController } from './media.controller';
import { MediaService } from './providers/media.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ScanCode]),
    HmiModule,
    SafetyModule,
    AuditModule,
  ],
  controllers: [MediaController],
  providers: [MediaService],
  exports: [MediaService],
})
export class MediaModule {}
