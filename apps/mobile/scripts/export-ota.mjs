import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { loadMobileEnv } from './load-env.mjs';

loadMobileEnv();

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

writeFileSync(join(otaRoot, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`Wrote ${join(otaRoot, 'manifest.json')}`);
