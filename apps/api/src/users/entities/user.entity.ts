import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserRole } from '../enums/user-role.enum';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', unique: true })
  email!: string;

  @Column({ name: 'password_hash', type: 'varchar' })
  passwordHash!: string;

  @Column({ type: 'varchar', default: UserRole.OPERATOR })
  role!: UserRole;

  @Column({ name: 'display_name', type: 'varchar', nullable: true })
  displayName?: string | null;

  @Column({ name: 'locale', type: 'varchar', default: 'en' })
  locale!: string;

  @Column({ name: 'locale_pinned', type: 'boolean', default: false })
  localePinned!: boolean;

  @Column({ name: 'face_template', type: 'text', nullable: true })
  faceTemplate?: string | null;

  @Column({ type: 'boolean', default: false })
  suspended!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
