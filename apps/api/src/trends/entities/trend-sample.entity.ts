import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('trend_samples')
export class TrendSample {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'series_key', type: 'varchar' })
  seriesKey!: string;

  @Column({ type: 'float' })
  value!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
