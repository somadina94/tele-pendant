import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Load KEY=VALUE files into process.env.
 * @param {string} filePath
 * @param {{ override?: boolean }} [opts]
 */
export function loadEnvFile(filePath, { override = false } = {}) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (override || process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

/** Root .env then apps/mobile/.env (mobile overrides). */
export function loadMobileEnv() {
  loadEnvFile(join(mobileRoot, '../../.env'));
  loadEnvFile(join(mobileRoot, '.env'), { override: true });
}

/** Same order as apps/mobile/app.config.js. A missing URL stops the build. */
export function resolveApiUrl() {
  const mobileDev = process.env.MOBILE_API_URL?.trim();
  if (mobileDev) return mobileDev.replace(/\/$/, '');

  const explicit = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, '');

  const appUrl = process.env.APP_URL?.trim().replace(/\/$/, '');
  if (appUrl) {
    return `${appUrl.replace(/\/api\/v1$/, '')}/api/v1`;
  }

  throw new Error(
    'Set EXPO_PUBLIC_API_URL or APP_URL before building the phone app.',
  );
}

export function resolveOtaOrigin() {
  const origin = process.env.OTA_PUBLIC_URL?.trim().replace(/\/$/, '');
  if (!origin) {
    throw new Error('Set OTA_PUBLIC_URL before building the phone app.');
  }
  return origin;
}
