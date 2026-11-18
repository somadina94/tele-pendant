import { MigrationInterface, QueryRunner } from 'typeorm';
import { addColumnIfMissing } from '../column-exists';

export class AddAuditClientId1762386000000 implements MigrationInterface {
  name = 'AddAuditClientId1762386000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await addColumnIfMissing(queryRunner, 'audit_logs', 'client_id', 'varchar');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN "client_id"`);
  }
}
