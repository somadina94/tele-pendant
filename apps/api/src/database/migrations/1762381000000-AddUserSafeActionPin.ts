import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserSafeActionPin1762381000000 implements MigrationInterface {
  name = 'AddUserSafeActionPin1762381000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "safe_action_pin_hash" varchar`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "safe_action_pin_hash"`,
    );
  }
}
