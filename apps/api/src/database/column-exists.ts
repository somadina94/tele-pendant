import { QueryRunner } from 'typeorm';

export async function columnExists(
  queryRunner: QueryRunner,
  table: string,
  column: string,
): Promise<boolean> {
  const rows = (await queryRunner.query(
    `PRAGMA table_info("${table}")`,
  )) as Array<{ name: string }>;
  return rows.some((row) => row.name === column);
}

export async function addColumnIfMissing(
  queryRunner: QueryRunner,
  table: string,
  column: string,
  definition: string,
): Promise<void> {
  if (await columnExists(queryRunner, table, column)) return;
  await queryRunner.query(
    `ALTER TABLE "${table}" ADD "${column}" ${definition}`,
  );
}
