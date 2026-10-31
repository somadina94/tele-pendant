import { registerAs } from '@nestjs/config';
import { join } from 'path';

export default registerAs('database', () => ({
  path:
    process.env.DATABASE_PATH ||
    join(process.cwd(), 'data', 'tele-pendant.sqlite'),
  synchronize: process.env.DATABASE_SYNC === 'true' ? true : false,
  autoLoadEntities: process.env.DATABASE_AUTOLOAD === 'true' ? true : false,
}));
