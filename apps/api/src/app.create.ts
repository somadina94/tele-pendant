import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import {
  clientExpectsExpoSignature,
  loadOtaPrivateKeyPem,
  signExpoManifestBody,
} from './ota/ota-code-signing';

function otaDirectory(): string {
  const candidates = [
    join(process.cwd(), 'ota'),
    join(process.cwd(), 'apps', 'api', 'ota'),
    join(__dirname, '..', 'ota'),
    join(__dirname, '..', '..', 'ota'),
  ];
  for (const dir of candidates) {
    if (existsSync(join(dir, 'manifest.json'))) return dir;
  }
  return candidates[0];
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
    const file = join(root, 'manifest.json');
    if (!existsSync(file)) {
      res.status(404).type('application/json').json({
        message: 'OTA manifest missing — publish apps/api/ota on the API host',
      });
      return;
    }
    const body = readFileSync(file);
    const expectsSignature = clientExpectsExpoSignature(
      req.headers['expo-expect-signature'],
    );
    const privateKey = loadOtaPrivateKeyPem();
    if (expectsSignature && !privateKey) {
      res.status(400).type('application/json').json({
        message:
          'OTA code signing private key is not configured (TP-43). Set OTA_CODE_SIGNING_PRIVATE_KEY or place ota/private-key.pem.',
      });
      return;
    }
    otaHeaders(res);
    if (privateKey) {
      try {
        res.setHeader('expo-signature', signExpoManifestBody(body, privateKey));
      } catch {
        res.status(500).type('application/json').json({
          message: 'Failed to sign OTA manifest',
        });
        return;
      }
    }
    res.type('application/json');
    res.send(body);
    return;
  }
  const asset = /^\/ota\/assets\/([^/]+)$/.exec(req.path);
  if (!asset || asset[1].includes('..')) {
    next();
    return;
  }
  const file = join(root, 'assets', asset[1]);
  if (!existsSync(file)) {
    res.status(404).type('application/json').json({
      message: 'OTA asset not found',
    });
    return;
  }
  otaHeaders(res);
  res.sendFile(file, (err) => {
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

  const liveSwaggerUrl =
    process.env.SWAGGER_LIVE_URL ?? 'https://api.tele-pendant.jahbyte.com';
  const localSwaggerUrl =
    process.env.APP_URL && /localhost|127\.0\.0\.1/.test(process.env.APP_URL)
      ? process.env.APP_URL
      : `http://localhost:${process.env.PORT ?? 3010}`;

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Tele-Pendant API')
    .setDescription(
      'Industrial tele-pendant HMI API. Modbus TCP, cell matrix, safety supervision, alarms, trends, local assistant. Use the Servers dropdown to target Localhost or Live. Authorize with oauth2 (username = email, password = account password), or paste a Bearer token from POST /auth/login.',
    )
    .setVersion('1.0')
    .addCookieAuth('access_token')
    .addBearerAuth({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      description:
        'Paste `accessToken` from POST /api/v1/auth/login (or use oauth2 below for email + password).',
    })
    .addOAuth2(
      {
        type: 'oauth2',
        description:
          'Swagger login: username = account email, password = account password. Client id/secret can be left blank.',
        flows: {
          password: {
            tokenUrl: '/api/v1/auth/token',
            scopes: {},
          },
        },
      },
      'oauth2',
    )
    .addServer(liveSwaggerUrl, 'Live')
    .addServer(localSwaggerUrl, 'Localhost')
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

  if (process.env.NODE_ENV !== 'production') {
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api', app, document);
  }

  app.enableCors({
    origin: true,
    credentials: true,
  });
}
