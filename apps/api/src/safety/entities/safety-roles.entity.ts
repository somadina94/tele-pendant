import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('safety_roles')
export class SafetyRoles {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'estop_register_id', type: 'varchar', nullable: true })
  eStopRegisterId?: string | null;

  @Column({ name: 'deadman_register_id', type: 'varchar', nullable: true })
  deadmanRegisterId?: string | null;

  @Column({ name: 'heartbeat_register_id', type: 'varchar', nullable: true })
  heartbeatRegisterId?: string | null;

  @Column({ name: 'safe_state_register_id', type: 'varchar', nullable: true })
  safeStateRegisterId?: string | null;

  /** One-tap Media UP/DOWN and spoken jogs. Default off (hold-to-run only). */
  @Column({ name: 'allow_timed_media_motion', type: 'boolean', default: false })
  allowTimedMediaMotion!: boolean;

  /** Software STOP latch. Survives an API restart while the PLC coil is low. */
  @Column({
    name: 'operator_estop_latched',
    type: 'boolean',
    default: false,
  })
  operatorEStopLatched!: boolean;
}
