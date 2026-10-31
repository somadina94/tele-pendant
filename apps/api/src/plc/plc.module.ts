import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlcConnection } from './entities/plc-connection.entity';
import { PlcController } from './plc.controller';
import { PlcService } from './providers/plc.service';

@Module({
  imports: [TypeOrmModule.forFeature([PlcConnection])],
  controllers: [PlcController],
  providers: [PlcService],
  exports: [PlcService],
})
export class PlcModule {}
