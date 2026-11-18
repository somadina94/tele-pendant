import { MigrationInterface, QueryRunner } from 'typeorm';
import { addColumnIfMissing } from '../column-exists';

export class AddUserSuspended1762380000000 implements MigrationInterface {
  name = 'AddUserSuspended1762380000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await addColumnIfMissing(
      queryRunner,
      'users',
      'suspended',
      'boolean NOT NULL DEFAULT 0',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "suspended"`);
  }
}
