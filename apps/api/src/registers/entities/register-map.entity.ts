import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type RegisterKind = 'coil' | 'discrete' | 'holding' | 'input';

@Entity('register_maps')
export class RegisterMap {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', unique: true })
  name!: string;

  @Column({ type: 'int' })
  address!: number;

  @Column({ type: 'varchar' })
  kind!: RegisterKind;

  @Column({ name: 'data_type', type: 'varchar', default: 'bool' })
  dataType!: string;

  @Column({ type: 'float', default: 1 })
  scale!: number;

  @Column({ type: 'varchar', default: 'rw' })
  rw!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
