import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { appCreate } from './app.create';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Face challenge sends 3 JPEG data-URLs; default Express limit is 100kb.
  app.useBodyParser('json', { limit: '8mb' });
  app.useBodyParser('urlencoded', { limit: '8mb', extended: true });
  appCreate(app);
  await app.listen(process.env.PORT ?? 3010);
}
void bootstrap();
