const fs = require('fs');
const path = require('path');

function loadEnvFile(filePath, { override = false } = {}) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
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

// Root first (APP_URL fallback), then mobile .env wins for EXPO_PUBLIC_* etc.
loadEnvFile(path.join(__dirname, '../../.env'));
loadEnvFile(path.join(__dirname, '.env'), { override: true });

const appJson = require('./app.json');

function resolveApiUrl() {
  const explicit = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, '');
  const appUrl = process.env.APP_URL?.trim().replace(/\/$/, '');
  if (appUrl) return `${appUrl}/api/v1`;
  return 'https://api.tele-pendant.jahbyte.com/api/v1';
}

const apiUrl = resolveApiUrl();
process.env.EXPO_PUBLIC_API_URL = apiUrl;

module.exports = {
  expo: {
    ...appJson.expo,
    updates: {
      ...(appJson.expo.updates ?? {}),
      url:
        process.env.OTA_PUBLIC_URL?.replace(/\/$/, '')
          ? `${process.env.OTA_PUBLIC_URL.replace(/\/$/, '')}/ota/manifest`
          : (appJson.expo.updates?.url ??
            'https://api.tele-pendant.jahbyte.com/ota/manifest'),
    },
    extra: {
      ...(appJson.expo.extra ?? {}),
      apiUrl,
      eas: appJson.expo.extra?.eas,
    },
  },
};
