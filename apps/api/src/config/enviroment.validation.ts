import * as Joi from 'joi';

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

  MODBUS_HOST: Joi.string().default('127.0.0.1'),
  MODBUS_PORT: Joi.number().port().default(1502),
  MODBUS_UNIT_ID: Joi.number().integer().min(0).default(1),
});
