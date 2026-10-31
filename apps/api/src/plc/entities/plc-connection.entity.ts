import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('plc_connections')
export class PlcConnection {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', unique: true })
  label!: string;

  @Column({ type: 'varchar', default: '127.0.0.1' })
  host!: string;

  @Column({ type: 'int', default: 1502 })
  port!: number;

  @Column({ name: 'unit_id', type: 'int', default: 1 })
  unitId!: number;

  @Column({ name: 'poll_ms', type: 'int', default: 250 })
  pollMs!: number;

  @Column({ type: 'boolean', default: true })
  enabled!: boolean;

  @Column({ name: 'is_simulator', type: 'boolean', default: false })
  isSimulator!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
