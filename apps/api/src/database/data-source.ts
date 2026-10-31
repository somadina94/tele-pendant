import { DataSource } from 'typeorm';
import { join } from 'path';

export default new DataSource({
  type: 'better-sqlite3',
  database:
    process.env.DATABASE_PATH ||
    join(process.cwd(), 'data', 'tele-pendant.sqlite'),
  entities: [join(__dirname, '..', '**', '*.entity.{ts,js}')],
  migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
  synchronize: false,
});
