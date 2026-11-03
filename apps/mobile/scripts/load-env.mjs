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
