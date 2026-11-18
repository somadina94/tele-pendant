import { MigrationInterface, QueryRunner } from 'typeorm';
import { addColumnIfMissing, columnExists } from '../column-exists';

export class AddCellSecondaryRegister1762384000000 implements MigrationInterface {
  name = 'AddCellSecondaryRegister1762384000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const already = await columnExists(
      queryRunner,
      'cells',
      'secondary_register_id',
    );
    await addColumnIfMissing(
      queryRunner,
      'cells',
      'secondary_register_id',
      'varchar',
    );
    if (already) return;
    const driver = queryRunner.connection.options.type;
    if (driver === 'better-sqlite3' || driver === 'sqlite') return;
    await queryRunner.query(
      `ALTER TABLE "cells" ADD CONSTRAINT "FK_cells_secondary_register" FOREIGN KEY ("secondary_register_id") REFERENCES "register_maps"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "cells" DROP CONSTRAINT "FK_cells_secondary_register"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cells" DROP COLUMN "secondary_register_id"`,
    );
  }
}
