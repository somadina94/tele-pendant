import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { BackgroundDisplay } from '../../backgrounds/entities/background-display.entity';
import { RegisterMap } from '../../registers/entities/register-map.entity';

@Entity('overlay_labels')
export class OverlayLabel {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  label!: string;

  /** Percent position on background (0–100). */
  @Column({ name: 'x_pct', type: 'float' })
  xPct!: number;

  @Column({ name: 'y_pct', type: 'float' })
  yPct!: number;

  @Column({ type: 'varchar', default: '{value}' })
  format!: string;

  @ManyToOne(() => BackgroundDisplay, { eager: true })
  @JoinColumn({ name: 'background_id' })
  background!: BackgroundDisplay;

  @ManyToOne(() => RegisterMap, { eager: true, nullable: true })
  @JoinColumn({ name: 'register_id' })
  register?: RegisterMap | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
