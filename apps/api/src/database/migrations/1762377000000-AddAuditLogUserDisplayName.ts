import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAuditLogUserDisplayName1762377000000
  implements MigrationInterface
{
  name = 'AddAuditLogUserDisplayName1762377000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ADD "user_display_name" varchar`,
    );
    await queryRunner.query(`
      UPDATE "audit_logs"
      SET "user_display_name" = (
        SELECT "users"."display_name"
        FROM "users"
        WHERE "users"."id" = "audit_logs"."user_id"
      )
      WHERE "user_id" IS NOT NULL
        AND ("user_display_name" IS NULL OR "user_display_name" = '')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "audit_logs" DROP COLUMN "user_display_name"`,
    );
  }
}
