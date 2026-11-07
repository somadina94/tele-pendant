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
  // Root .env: phone on same Wi‑Fi as Docker (overrides mobile .env production URL).
  const mobileDev = process.env.MOBILE_API_URL?.trim();
  if (mobileDev) return mobileDev.replace(/\/$/, '');

  const explicit = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, '');

  const appUrl = process.env.APP_URL?.trim().replace(/\/$/, '');
  if (
    appUrl &&
    /localhost|127\.0\.0\.1|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\./i.test(
      appUrl,
    )
  ) {
    return `${appUrl.replace(/\/api\/v1$/, '')}/api/v1`;
  }
  if (appUrl && !appUrl.includes('tele-pendant.jahbyte.com')) {
    return `${appUrl}/api/v1`;
  }

  return 'https://api.tele-pendant.jahbyte.com/api/v1';
}

const apiUrl = resolveApiUrl();
process.env.EXPO_PUBLIC_API_URL = apiUrl;
console.log(`[tele-pendant] Expo API base: ${apiUrl}`);

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
      codeSigningCertificate:
        appJson.expo.updates?.codeSigningCertificate ??
        './certs/certificate.pem',
      codeSigningMetadata: appJson.expo.updates?.codeSigningMetadata ?? {
        keyid: 'main',
        alg: 'rsa-v1_5-sha256',
      },
      requestHeaders: {
        ...(appJson.expo.updates?.requestHeaders ?? {}),
        'expo-channel-name':
          process.env.EXPO_UPDATE_CHANNEL?.trim() || 'production',
      },
    },
    extra: {
      ...(appJson.expo.extra ?? {}),
      apiUrl,
      eas: appJson.expo.extra?.eas,
    },
  },
};
