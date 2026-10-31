import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TrendSample } from './entities/trend-sample.entity';
import { TrendsController } from './trends.controller';
import { TrendsService } from './providers/trends.service';

@Module({
  imports: [TypeOrmModule.forFeature([TrendSample])],
  controllers: [TrendsController],
  providers: [TrendsService],
  exports: [TrendsService],
})
export class TrendsModule {}
