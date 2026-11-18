import { MigrationInterface, QueryRunner } from 'typeorm';
import { addColumnIfMissing } from '../column-exists';

export class AddOperatorEStopLatched1762385000000 implements MigrationInterface {
  name = 'AddOperatorEStopLatched1762385000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await addColumnIfMissing(
      queryRunner,
      'safety_roles',
      'operator_estop_latched',
      'boolean NOT NULL DEFAULT 0',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "safety_roles" DROP COLUMN "operator_estop_latched"`,
    );
  }
}
