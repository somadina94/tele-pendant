import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCellVariableSpeed1762383000000 implements MigrationInterface {
  name = 'AddCellVariableSpeed1762383000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "cells" ADD "variable_speed" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(
      `ALTER TABLE "cells" ADD "slow_speed_pct" integer NOT NULL DEFAULT 30`,
    );
    await queryRunner.query(
      `ALTER TABLE "cells" ADD "fast_speed_pct" integer NOT NULL DEFAULT 100`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "cells" DROP COLUMN "fast_speed_pct"`);
    await queryRunner.query(`ALTER TABLE "cells" DROP COLUMN "slow_speed_pct"`);
    await queryRunner.query(`ALTER TABLE "cells" DROP COLUMN "variable_speed"`);
  }
}
