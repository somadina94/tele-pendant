import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { TrendSample } from '../entities/trend-sample.entity';

@Injectable()
export class TrendsService {
  constructor(
    @InjectRepository(TrendSample)
    private readonly samples: Repository<TrendSample>,
  ) {}

  async record(seriesKey: string, value: number): Promise<void> {
    await this.samples.save(this.samples.create({ seriesKey, value }));
    // keep last ~500 per series (cheap prune)
    const old = await this.samples.find({
      where: { seriesKey },
      order: { createdAt: 'DESC' },
      skip: 500,
      take: 100,
    });
    if (old.length) {
      await this.samples.remove(old);
    }
  }

  async series(seriesKey: string, minutes = 15) {
    const since = new Date(Date.now() - minutes * 60_000);
    return this.samples.find({
      where: { seriesKey, createdAt: MoreThan(since) },
      order: { createdAt: 'ASC' },
      take: 500,
    });
  }
}
