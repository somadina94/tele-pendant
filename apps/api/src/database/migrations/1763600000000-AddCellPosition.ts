import { MigrationInterface, QueryRunner } from 'typeorm';
import { addColumnIfMissing } from '../column-exists';

export class AddCellPosition1763600000000 implements MigrationInterface {
  name = 'AddCellPosition1763600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await addColumnIfMissing(queryRunner, 'cells', 'x_pct', 'float');
    await addColumnIfMissing(queryRunner, 'cells', 'y_pct', 'float');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "cells" DROP COLUMN "y_pct"`);
    await queryRunner.query(`ALTER TABLE "cells" DROP COLUMN "x_pct"`);
  }
}
