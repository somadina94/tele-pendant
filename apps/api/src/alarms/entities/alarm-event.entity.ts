import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AlarmDefinition } from './alarm-definition.entity';

@Entity('alarm_events')
export class AlarmEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => AlarmDefinition, { eager: true })
  @JoinColumn({ name: 'definition_id' })
  definition!: AlarmDefinition;

  @Column({ type: 'float' })
  value!: number;

  @Column({ type: 'varchar', default: 'active' })
  state!: 'active' | 'acked' | 'cleared' | 'shelved';

  @Column({ name: 'acked_at', type: 'datetime', nullable: true })
  ackedAt?: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
