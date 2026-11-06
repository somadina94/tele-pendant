import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const signingRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'signing',
);

const ENV_KEYS = [
  'TELE_PENDANT_ANDROID_KEYSTORE',
  'TELE_PENDANT_ANDROID_KEYSTORE_PASSWORD',
  'TELE_PENDANT_ANDROID_KEY_ALIAS',
  'TELE_PENDANT_ANDROID_KEY_PASSWORD',
  'APPLE_TEAM_ID',
  'IOS_SCHEME',
  'IOS_EXPORT_METHOD',
  'IOS_PROVISIONING_PROFILE_NAME',
];

function parseEnvFile(text) {
  for (const line of text.split('\n')) {
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
    if (!ENV_KEYS.includes(key)) continue;
    if (process.env[key]?.trim()) continue;
    if (key === 'TELE_PENDANT_ANDROID_KEYSTORE' && value) {
      value = isAbsolute(value) ? value : join(signingRoot, value);
    }
    process.env[key] = value;
  }
}

export function loadMobileSigningEnv() {
  const credPath = join(signingRoot, 'credentials.env');
  if (existsSync(credPath)) {
    parseEnvFile(readFileSync(credPath, 'utf8'));
    console.log(`Loaded mobile signing env from ${credPath}`);
    return;
  }
  const ksDir = join(signingRoot, 'android');
  if (
    !process.env.TELE_PENDANT_ANDROID_KEYSTORE?.trim() &&
    existsSync(ksDir)
  ) {
    const files = existsSync(ksDir) ? readdirSync(ksDir) : [];
    const keystoreFile = files.find(
      (name) =>
        name !== '.gitkeep' &&
        (name.endsWith('.keystore') || name.endsWith('.jks')),
    );
    if (keystoreFile) {
      const candidate = join(ksDir, keystoreFile);
      process.env.TELE_PENDANT_ANDROID_KEYSTORE = candidate;
      console.log(`Using Android keystore ${candidate}`);
    }
  }
}

export { signingRoot };
