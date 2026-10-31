import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';

function otaDirectory(): string {
  const besideApi = join(process.cwd(), 'ota');
  if (existsSync(join(besideApi, 'manifest.json'))) return besideApi;
  return join(process.cwd(), 'apps', 'api', 'ota');
}

function otaHeaders(res: Response): void {
  res.setHeader('expo-protocol-version', '1');
  res.setHeader('expo-runtime-version', '0.0.1');
  res.setHeader('cache-control', 'no-cache');
}

/** Serves apps/api/ota outside the /api/v1 prefix. No login. */
function serveOta(req: Request, res: Response, next: NextFunction): void {
  if (req.method !== 'GET') {
    next();
    return;
  }
  const root = otaDirectory();
  if (req.path === '/ota/manifest') {
    otaHeaders(res);
    res.type('application/json');
    res.sendFile(join(root, 'manifest.json'), (err) => {
      if (err) next(err);
    });
    return;
  }
  const asset = /^\/ota\/assets\/([^/]+)$/.exec(req.path);
  if (!asset || asset[1].includes('..')) {
    next();
    return;
  }
  otaHeaders(res);
  res.sendFile(join(root, 'assets', asset[1]), (err) => {
    if (err) next(err);
  });
}

/**
 * Shared Nest application bootstrap (pipes, Swagger, CORS, cookies).
 * Mirrors giftcards/server app.create.ts conventions.
 * @param app Nest application instance
 */
export function appCreate(app: INestApplication): void {
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(cookieParser());
  app.use(serveOta);
  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Tele-Pendant API')
    .setDescription(
      'Industrial tele-pendant HMI API. Modbus TCP, cell matrix, safety supervision, alarms, trends, local assistant.',
    )
    .setVersion('1.0')
    .addCookieAuth('access_token')
    .addBearerAuth()
    .addServer('http://localhost:3010', 'Local development')
    .addTag('health', 'Service health')
    .addTag('auth', 'Authentication')
    .addTag('audit', 'Security audit logs')
    .addTag('cells', 'NxM cell matrix')
    .addTag('plc', 'PLC connections')
    .addTag('alarms', 'Alarm management')
    .addTag('safety', 'Deadman, watchdog, e-stop, safe-state')
    .addTag('diagnostics', 'Connection and runtime diagnostics')
    .addTag('assistant', 'Local document assistant')
    .addTag('media', 'Camera, QR/barcode, voice commands')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api', app, document);

  app.enableCors({
    origin: true,
    credentials: true,
  });
}
