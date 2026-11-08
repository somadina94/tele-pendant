import { registerAs } from '@nestjs/config';

export default registerAs('appConfig', () => ({
  environment: process.env.NODE_ENV || 'development',
  apiVersion: process.env.API_VERSION || 'v1',
  appUrl: process.env.APP_URL,
  frontendUrl: process.env.FRONTEND_URL,
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  jwt: {
    secret: process.env.JWT_SECRET,
    audience: process.env.JWT_TOKEN_AUDIENCE,
    issuer: process.env.JWT_TOKEN_ISSUER,
    accessTokenTtl: parseInt(process.env.JWT_ACCESS_TOKEN_TTL ?? '3600', 10),
    refreshTokenTtl: parseInt(process.env.JWT_REFRESH_TOKEN_TTL ?? '86400', 10),
  },
  admin: {
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
  },
  modbus: {
    host: process.env.MODBUS_HOST || '127.0.0.1',
    port: parseInt(process.env.MODBUS_PORT ?? '1502', 10),
    unitId: parseInt(process.env.MODBUS_UNIT_ID ?? '1', 10),
  },
  cursor: {
    apiKey: process.env.CURSOR_API_KEY?.trim() || '',
    agentCwd: process.env.CURSOR_AGENT_CWD?.trim() || '',
    model: process.env.CURSOR_MODEL?.trim() || 'composer-2.5',
  },
  faceTemplateKey: process.env.FACE_TEMPLATE_KEY?.trim() || '',
  mail: {
    host: process.env.MAIL_HOST?.trim() || '',
    port: parseInt(process.env.MAIL_PORT ?? '587', 10),
    username: process.env.SMTP_USERNAME?.trim() || '',
    password: process.env.SMTP_PASSWORD?.trim() || '',
    from: process.env.MAIL_FROM?.trim() || '',
  },
}));
