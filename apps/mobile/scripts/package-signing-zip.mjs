#!/usr/bin/env node
/**
 * Zip apps/mobile/signing/ (android + ios + credentials.env) for secure handover.
 * Output: apps/mobile/dist/mobile-signing-handover.zip (gitignored)
 */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const signingRoot = join(mobileRoot, 'signing');
const outDir = join(mobileRoot, 'dist');
const zipPath = join(outDir, 'mobile-signing-handover.zip');

const androidDir = join(signingRoot, 'android');
const iosDir = join(signingRoot, 'ios');
const cred = join(signingRoot, 'credentials.env');

function dirHasSecrets(dir) {
  if (!existsSync(dir)) return false;
  return readdirSync(dir).some((name) => {
    if (name === '.gitkeep') return false;
    return statSync(join(dir, name)).isFile();
  });
}

const hasAndroid = dirHasSecrets(androidDir);
const hasIos = dirHasSecrets(iosDir);

if (!hasAndroid && !hasIos && !existsSync(cred)) {
  console.error(
    'Nothing to zip. Add files under apps/mobile/signing/android/ and/or ios/, and credentials.env',
  );
  console.error('See apps/mobile/signing/README.md');
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

execSync(`rm -f "${zipPath}"`, { stdio: 'inherit' });

const cwd = signingRoot;
const parts = [];
if (existsSync(cred)) parts.push('credentials.env');
if (hasAndroid) parts.push('android');
if (hasIos) parts.push('ios');

execSync(
  `zip -r "${zipPath}" ${parts.join(' ')} -x "*/.gitkeep" "README.md" "credentials.example.env"`,
  { cwd, stdio: 'inherit' },
);

console.log(`\nCreated ${zipPath}`);
console.log(
  'Send this zip securely (not git). Recipient unpacks into apps/mobile/signing/ on their machine.',
);
console.log(`Archive label: mobile-signing-handover-${stamp}`);
