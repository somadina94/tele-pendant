import { MigrationInterface, QueryRunner } from 'typeorm';
import { addColumnIfMissing, columnExists } from '../column-exists';

export class AddCellBackground1762387000000 implements MigrationInterface {
  name = 'AddCellBackground1762387000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await addColumnIfMissing(queryRunner, 'cells', 'background_id', 'varchar');
    if (!(await columnExists(queryRunner, 'cells', 'background_id'))) return;
    await queryRunner.query(`
      UPDATE cells
      SET background_id = (
        SELECT id FROM background_displays WHERE active = 1 LIMIT 1
      )
      WHERE background_id IS NULL
        AND EXISTS (SELECT 1 FROM background_displays WHERE active = 1)
    `);
    await queryRunner.query(`
      UPDATE cells
      SET background_id = (SELECT id FROM background_displays LIMIT 1)
      WHERE background_id IS NULL
        AND EXISTS (SELECT 1 FROM background_displays)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await columnExists(queryRunner, 'cells', 'background_id')) {
      await queryRunner.dropColumn('cells', 'background_id');
    }
  }
}
