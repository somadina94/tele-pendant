#!/usr/bin/env node
/**
 * Handover entry point: APK, AAB, and iOS IPA locally.
 *
 * Signing keys and provisioning profiles are NOT in the repo; see docs/MOBILE_RELEASE.md.
 *
 * Usage (repo root):
 *   node scripts/handover-native-build.mjs [apk|aab|ios|android|all]
 *   pnpm handover:mobile[:apk|:aab|:ios|:android]
 *
 * Targets:
 *   apk     - Android APK (side-load / adb)
 *   aab     - Android App Bundle (Play Store)
 *   ios     - iOS IPA (macOS + Xcode)
 *   android - apk + aab
 *   all     - apk + aab + ios (default)
 */
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = (process.argv[2] ?? 'all').toLowerCase();

const scripts = {
  apk: 'apk:release',
  aab: 'aab:release',
  ios: 'ios:release',
};

function runMobile(script) {
  console.log(`\n=== @tele-pendant/mobile ${script} ===\n`);
  const result = spawnSync(
    'pnpm',
    ['--filter', '@tele-pendant/mobile', 'run', script],
    { cwd: root, stdio: 'inherit', env: process.env },
  );
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const plan = [];
if (target === 'apk') plan.push('apk');
else if (target === 'aab') plan.push('aab');
else if (target === 'ios') plan.push('ios');
else if (target === 'android') plan.push('apk', 'aab');
else if (target === 'all' || target === 'both') plan.push('apk', 'aab', 'ios');
else {
  console.error(
    'Usage: handover-native-build.mjs [apk|aab|ios|android|all]',
  );
  process.exit(1);
}

for (const key of plan) {
  runMobile(scripts[key]);
}

console.log('\nDone. Artifacts under apps/mobile/dist/ (gitignored):');
if (plan.includes('apk')) console.log('  - tele-pendant-release.apk');
if (plan.includes('aab')) console.log('  - tele-pendant-release.aab');
if (plan.includes('ios')) console.log('  - tele-pendant-release.ipa');
