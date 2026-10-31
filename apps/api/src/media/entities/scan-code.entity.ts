import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('scan_codes')
export class ScanCode {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** QR / barcode payload value */
  @Column({ type: 'varchar', unique: true })
  code!: string;

  @Column({ type: 'varchar' })
  label!: string;

  @Column({ type: 'varchar', default: 'asset' })
  kind!: string;

  /** Optional deep-link target inside the HMI (e.g. /operator, /ops) */
  @Column({ name: 'route_hint', type: 'varchar', nullable: true })
  routeHint?: string | null;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
