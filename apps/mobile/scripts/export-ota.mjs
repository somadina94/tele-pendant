import { createHash, createSign, createPrivateKey } from 'node:crypto';
import { execSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { loadMobileEnv } from './load-env.mjs';
import { loadMobileSigningEnv } from './load-mobile-signing.mjs';

loadMobileEnv();
loadMobileSigningEnv();

const mobileRoot = resolve(import.meta.dirname, '..');
const exportDir = join(mobileRoot, 'dist-ota');
const otaRoot = resolve(mobileRoot, '../api/ota');
const assetDir = join(otaRoot, 'assets');

rmSync(exportDir, { recursive: true, force: true });
execSync(`npx expo export --output-dir ${exportDir} --platform android`, {
  cwd: mobileRoot,
  stdio: 'inherit',
  env: process.env,
});

const metadata = JSON.parse(
  readFileSync(join(exportDir, 'metadata.json'), 'utf8'),
);
const bundleRel =
  metadata.fileMetadata?.android?.bundle ?? metadata.fileMetadata?.ios?.bundle;
if (!bundleRel) {
  throw new Error('expo export did not write a bundle path in metadata.json');
}

mkdirSync(assetDir, { recursive: true });
const bundleName = basename(bundleRel);
const bundleBytes = readFileSync(join(exportDir, bundleRel));
cpSync(join(exportDir, bundleRel), join(assetDir, bundleName));
const hash = createHash('sha256').update(bundleBytes).digest('hex');
const configured =
  process.env.OTA_PUBLIC_URL ?? 'https://api.tele-pendant.jahbyte.com';
const baseUrl = new URL(
  configured.includes('://') ? configured : `https://${configured}`,
);
if (baseUrl.protocol !== 'https:') {
  throw new Error('OTA_PUBLIC_URL must use https');
}
const base = baseUrl.origin;

const manifest = {
  id: crypto.randomUUID(),
  createdAt: new Date().toISOString(),
  runtimeVersion: '0.0.1',
  launchAsset: {
    hash,
    key: bundleName,
    contentType: 'application/javascript',
    url: `${base}/ota/assets/${bundleName}`,
  },
  assets: [],
  metadata: {},
  extra: {
    note: 'Published by apps/mobile scripts/export-ota.mjs. Camera and speech still need a new binary.',
  },
};

const manifestJson = `${JSON.stringify(manifest, null, 2)}\n`;
const manifestPath = join(otaRoot, 'manifest.json');
writeFileSync(manifestPath, manifestJson);
console.log(`Wrote ${manifestPath}`);

const keyCandidates = [
  process.env.OTA_CODE_SIGNING_PRIVATE_KEY_PATH?.trim(),
  join(mobileRoot, 'signing/ota/private-key.pem'),
  join(otaRoot, 'private-key.pem'),
].filter(Boolean);
const keyPath = keyCandidates.find((path) => path && existsSync(path));
const inlineKey = process.env.OTA_CODE_SIGNING_PRIVATE_KEY?.trim();
const privateKeyPem = inlineKey?.includes('BEGIN')
  ? inlineKey.replace(/\\n/g, '\n')
  : keyPath
    ? readFileSync(keyPath, 'utf8')
    : null;
if (privateKeyPem) {
  const sign = createSign('RSA-SHA256');
  sign.update(manifestJson);
  sign.end();
  const sig = sign
    .sign(createPrivateKey(privateKeyPem))
    .toString('base64');
  const header = `sig="${sig}", keyid="main", alg="rsa-v1_5-sha256"`;
  writeFileSync(join(otaRoot, 'manifest.signature'), `${header}\n`);
  if (keyPath && keyPath !== join(otaRoot, 'private-key.pem')) {
    cpSync(keyPath, join(otaRoot, 'private-key.pem'));
  }
  console.log('Wrote OTA code-signing signature (TP-43).');
} else {
  console.warn(
    'No OTA private key found — API will not be able to satisfy expo-expect-signature. Place signing/ota/private-key.pem or set OTA_CODE_SIGNING_PRIVATE_KEY_PATH.',
  );
}
