/**
 * Documented demo defaults from `.env.example` / README.
 * Production must not boot with these (TP-50).
 */
export const INSECURE_DEMO_DEFAULTS = {
  JWT_SECRET: 'change-me-tele-pendant-jwt-secret-min-32-chars',
  ADMIN_PASSWORD: 'change-me-admin-password',
  SAFE_ACTION_PIN: 'change-me-admin-password',
  FACE_TEMPLATE_KEY: 'change-me-face-template-key-min-32-chars',
} as const;

export type ProductionSecretEnv = {
  NODE_ENV?: string;
  JWT_SECRET?: string;
  ADMIN_PASSWORD?: string;
  SAFE_ACTION_PIN?: string;
  FACE_TEMPLATE_KEY?: string;
};

function isDemoOrEmpty(
  value: string | undefined,
  demoDefault: string,
): boolean {
  const trimmed = (value ?? '').trim();
  return trimmed.length === 0 || trimmed === demoDefault;
}

/**
 * Throws when NODE_ENV=production and any documented demo secret is still set
 * (or required secrets are empty). Safe no-op outside production.
 */
export function assertProductionSecrets(
  env: ProductionSecretEnv = process.env,
): void {
  if ((env.NODE_ENV ?? 'development') !== 'production') {
    return;
  }

  const offenders: string[] = [];

  if (isDemoOrEmpty(env.JWT_SECRET, INSECURE_DEMO_DEFAULTS.JWT_SECRET)) {
    offenders.push('JWT_SECRET');
  }
  if (
    isDemoOrEmpty(env.ADMIN_PASSWORD, INSECURE_DEMO_DEFAULTS.ADMIN_PASSWORD)
  ) {
    offenders.push('ADMIN_PASSWORD');
  }
  if (
    isDemoOrEmpty(env.SAFE_ACTION_PIN, INSECURE_DEMO_DEFAULTS.SAFE_ACTION_PIN)
  ) {
    offenders.push('SAFE_ACTION_PIN');
  }
  const faceKey = (env.FACE_TEMPLATE_KEY ?? '').trim();
  if (faceKey === INSECURE_DEMO_DEFAULTS.FACE_TEMPLATE_KEY) {
    offenders.push('FACE_TEMPLATE_KEY');
  }

  if (offenders.length === 0) {
    return;
  }

  throw new Error(
    `Refusing to start in production: replace documented demo defaults for ${offenders.join(', ')} (TP-50).`,
  );
}
