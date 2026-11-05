import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId?: string | null;

  @Column({ name: 'user_email', type: 'varchar', nullable: true })
  userEmail?: string | null;

  @Column({ name: 'user_display_name', type: 'varchar', nullable: true })
  userDisplayName?: string | null;

  @Column({ type: 'varchar' })
  action!: string;

  @Column({ type: 'varchar', nullable: true })
  resource?: string | null;

  @Column({ type: 'text', nullable: true })
  details?: string | null;

  @Column({ type: 'varchar', nullable: true })
  ip?: string | null;

  @Column({ type: 'varchar', default: 'success' })
  result!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
