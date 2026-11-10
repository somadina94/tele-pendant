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

  /**
   * FEAT-A2: motion cells may write holding.speedPct (slow/fast) while held.
   * Defaults on for new motion cells; ignored when not motion.
   */
  @Column({ name: 'variable_speed', type: 'boolean', default: true })
  variableSpeed!: boolean;

  @Column({ name: 'slow_speed_pct', type: 'int', default: 30 })
  slowSpeedPct!: number;

  @Column({ name: 'fast_speed_pct', type: 'int', default: 100 })
  fastSpeedPct!: number;

  @ManyToOne(() => RegisterMap, { nullable: true, eager: true })
  @JoinColumn({ name: 'primary_register_id' })
  primaryRegister?: RegisterMap | null;

  /**
   * P03A21 selectors: second PLC input (direction B).
   * Primary = direction A (up/open/fwd); secondary = direction B (down/close/back).
   */
  @ManyToOne(() => RegisterMap, { nullable: true, eager: true })
  @JoinColumn({ name: 'secondary_register_id' })
  secondaryRegister?: RegisterMap | null;

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
