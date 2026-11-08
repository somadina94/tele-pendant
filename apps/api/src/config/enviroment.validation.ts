import * as Joi from 'joi';
import { assertProductionSecrets } from './assert-production-secrets';

/**
 * After schema pass, refuse NODE_ENV=production with documented demo secrets (TP-50).
 */
function rejectProductionDemoSecrets(
  value: Record<string, unknown>,
  helpers: Joi.CustomHelpers,
) {
  try {
    const nodeEnv =
      typeof value.NODE_ENV === 'string' ? value.NODE_ENV : 'development';
    assertProductionSecrets({
      NODE_ENV: nodeEnv,
      JWT_SECRET:
        typeof value.JWT_SECRET === 'string' ? value.JWT_SECRET : undefined,
      ADMIN_PASSWORD:
        typeof value.ADMIN_PASSWORD === 'string'
          ? value.ADMIN_PASSWORD
          : undefined,
      SAFE_ACTION_PIN:
        typeof value.SAFE_ACTION_PIN === 'string'
          ? value.SAFE_ACTION_PIN
          : undefined,
      FACE_TEMPLATE_KEY:
        typeof value.FACE_TEMPLATE_KEY === 'string'
          ? value.FACE_TEMPLATE_KEY
          : undefined,
    });
  } catch (err) {
    return helpers.message({
      custom: err instanceof Error ? err.message : String(err),
    });
  }
  return value;
}

export default Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test', 'provision')
    .default('development'),
  PORT: Joi.number().port().default(3010),
  APP_URL: Joi.string().uri().required(),
  FRONTEND_URL: Joi.string().uri().required(),
  API_VERSION: Joi.string().default('v1'),

  DATABASE_PATH: Joi.string().default('./data/tele-pendant.sqlite'),
  DATABASE_SYNC: Joi.string().valid('true', 'false').default('true'),
  DATABASE_AUTOLOAD: Joi.string().valid('true', 'false').default('true'),

  JWT_SECRET: Joi.string().required(),
  JWT_TOKEN_AUDIENCE: Joi.string().required(),
  JWT_TOKEN_ISSUER: Joi.string().required(),
  JWT_ACCESS_TOKEN_TTL: Joi.number().required(),
  JWT_REFRESH_TOKEN_TTL: Joi.number().required(),
  COOKIE_SECURE: Joi.string().valid('true', 'false').default('false'),

  ADMIN_EMAIL: Joi.string().email().required(),
  ADMIN_PASSWORD: Joi.string().min(8).required(),

  /** Plant reset-PIN fallback; required uniqueness enforced in production (TP-50). */
  SAFE_ACTION_PIN: Joi.string().allow('').optional(),

  FACE_TEMPLATE_KEY: Joi.string().allow('').optional(),

  MODBUS_HOST: Joi.string().default('127.0.0.1'),
  MODBUS_PORT: Joi.number().port().default(1502),
  MODBUS_UNIT_ID: Joi.number().integer().min(0).default(1),

  CURSOR_API_KEY: Joi.string().allow('').optional(),
  CURSOR_AGENT_CWD: Joi.string().allow('').optional(),
  CURSOR_MODEL: Joi.string().default('composer-2.5'),

  /** Zoho (or other) SMTP for optional per-user email OTP 2FA. All optional. */
  MAIL_HOST: Joi.string().allow('').optional(),
  MAIL_PORT: Joi.number().port().optional(),
  SMTP_USERNAME: Joi.string().allow('').optional(),
  SMTP_PASSWORD: Joi.string().allow('').optional(),
  MAIL_FROM: Joi.string().allow('').optional(),
}).custom(rejectProductionDemoSecrets);
