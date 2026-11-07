import {
  assertProductionSecrets,
  INSECURE_DEMO_DEFAULTS,
} from './assert-production-secrets';

describe('assertProductionSecrets (TP-50)', () => {
  it('allows demo defaults outside production', () => {
    expect(() =>
      assertProductionSecrets({
        NODE_ENV: 'development',
        JWT_SECRET: INSECURE_DEMO_DEFAULTS.JWT_SECRET,
        ADMIN_PASSWORD: INSECURE_DEMO_DEFAULTS.ADMIN_PASSWORD,
        SAFE_ACTION_PIN: INSECURE_DEMO_DEFAULTS.SAFE_ACTION_PIN,
        FACE_TEMPLATE_KEY: INSECURE_DEMO_DEFAULTS.FACE_TEMPLATE_KEY,
      }),
    ).not.toThrow();
  });

  it('allows production when secrets are rotated', () => {
    expect(() =>
      assertProductionSecrets({
        NODE_ENV: 'production',
        JWT_SECRET: 'prod-jwt-secret-not-the-demo-value-xxxxxxxx',
        ADMIN_PASSWORD: 'prod-admin-password-rotated',
        SAFE_ACTION_PIN: 'prod-plant-pin-rotated',
        FACE_TEMPLATE_KEY: 'prod-face-template-key-min-32-chars!!',
      }),
    ).not.toThrow();
  });

  it('refuses production when ADMIN_PASSWORD is the demo default', () => {
    expect(() =>
      assertProductionSecrets({
        NODE_ENV: 'production',
        JWT_SECRET: 'prod-jwt-secret-not-the-demo-value-xxxxxxxx',
        ADMIN_PASSWORD: INSECURE_DEMO_DEFAULTS.ADMIN_PASSWORD,
        SAFE_ACTION_PIN: 'prod-plant-pin-rotated',
      }),
    ).toThrow(/ADMIN_PASSWORD/);
  });

  it('refuses production when JWT_SECRET or SAFE_ACTION_PIN are demo defaults', () => {
    expect(() =>
      assertProductionSecrets({
        NODE_ENV: 'production',
        JWT_SECRET: INSECURE_DEMO_DEFAULTS.JWT_SECRET,
        ADMIN_PASSWORD: 'prod-admin-password-rotated',
        SAFE_ACTION_PIN: INSECURE_DEMO_DEFAULTS.SAFE_ACTION_PIN,
      }),
    ).toThrow(/JWT_SECRET.*SAFE_ACTION_PIN|SAFE_ACTION_PIN.*JWT_SECRET/);
  });

  it('refuses production when FACE_TEMPLATE_KEY is the demo default', () => {
    expect(() =>
      assertProductionSecrets({
        NODE_ENV: 'production',
        JWT_SECRET: 'prod-jwt-secret-not-the-demo-value-xxxxxxxx',
        ADMIN_PASSWORD: 'prod-admin-password-rotated',
        SAFE_ACTION_PIN: 'prod-plant-pin-rotated',
        FACE_TEMPLATE_KEY: INSECURE_DEMO_DEFAULTS.FACE_TEMPLATE_KEY,
      }),
    ).toThrow(/FACE_TEMPLATE_KEY/);
  });

  it('refuses production when SAFE_ACTION_PIN is empty', () => {
    expect(() =>
      assertProductionSecrets({
        NODE_ENV: 'production',
        JWT_SECRET: 'prod-jwt-secret-not-the-demo-value-xxxxxxxx',
        ADMIN_PASSWORD: 'prod-admin-password-rotated',
        SAFE_ACTION_PIN: '   ',
      }),
    ).toThrow(/SAFE_ACTION_PIN/);
  });
});
