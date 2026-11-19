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
  if (appUrl) {
    return `${appUrl.replace(/\/api\/v1$/, '')}/api/v1`;
  }

  throw new Error(
    'Set EXPO_PUBLIC_API_URL or APP_URL before building the phone app.',
  );
}

function resolveOtaUrl() {
  const origin = process.env.OTA_PUBLIC_URL?.trim().replace(/\/$/, '');
  if (!origin) {
    throw new Error('Set OTA_PUBLIC_URL before building the phone app.');
  }
  return `${origin}/ota/manifest`;
}

const apiUrl = resolveApiUrl();
process.env.EXPO_PUBLIC_API_URL = apiUrl;
console.log(`[tele-pendant] Expo API base: ${apiUrl}`);

function allowPlainHttp(url) {
  const flag = process.env.EXPO_PUBLIC_ALLOW_HTTP?.trim().toLowerCase();
  if (flag === 'true') return true;
  if (flag === 'false') return false;
  return url.startsWith('http://');
}

const httpAllowed = allowPlainHttp(apiUrl);

module.exports = {
  expo: {
    ...appJson.expo,
    android: {
      ...appJson.expo.android,
      usesCleartextTraffic: httpAllowed,
    },
    ios: {
      ...appJson.expo.ios,
      infoPlist: {
        ...(appJson.expo.ios?.infoPlist ?? {}),
        ...(httpAllowed
          ? { NSAppTransportSecurity: { NSAllowsLocalNetworking: true } }
          : {}),
      },
    },
    updates: {
      ...(appJson.expo.updates ?? {}),
      url: resolveOtaUrl(),
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
