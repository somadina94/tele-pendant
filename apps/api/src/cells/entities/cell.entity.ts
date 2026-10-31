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

@Entity('cells')
export class Cell {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'int' })
  row!: number;

  @Column({ type: 'int' })
  col!: number;

  @Column({ type: 'varchar' })
  label!: string;

  @Column({ type: 'varchar', default: 'default' })
  style!: string;

  /** Motion / command cells require deadman + safety gates. */
  @Column({ name: 'is_motion', type: 'boolean', default: false })
  isMotion!: boolean;

  /** Dangerous cells require supervisor confirm (safe-action). */
  @Column({ name: 'requires_safe_action', type: 'boolean', default: false })
  requiresSafeAction!: boolean;

  @ManyToOne(() => RegisterMap, { nullable: true, eager: true })
  @JoinColumn({ name: 'primary_register_id' })
  primaryRegister?: RegisterMap | null;

  @ManyToOne(() => RegisterMap, { nullable: true, eager: true })
  @JoinColumn({ name: 'feedback_register_id' })
  feedbackRegister?: RegisterMap | null;

  @ManyToOne(() => RegisterMap, { nullable: true, eager: true })
  @JoinColumn({ name: 'status_register_id' })
  statusRegister?: RegisterMap | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
