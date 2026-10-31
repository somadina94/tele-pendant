import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

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
