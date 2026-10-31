import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { RegisterMap } from '../../registers/entities/register-map.entity';

@Entity('alarm_definitions')
export class AlarmDefinition {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', unique: true })
  name!: string;

  @Column({ type: 'varchar', default: 'warning' })
  severity!: string;

  @Column({ name: 'compare_op', type: 'varchar', default: 'eq' })
  compareOp!: 'eq' | 'gt' | 'lt' | 'neq';

  @Column({ name: 'threshold', type: 'float', default: 1 })
  threshold!: number;

  @Column({ type: 'boolean', default: true })
  enabled!: boolean;

  @ManyToOne(() => RegisterMap, { eager: true })
  @JoinColumn({ name: 'register_id' })
  register!: RegisterMap;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
