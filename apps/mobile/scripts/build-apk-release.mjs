#!/usr/bin/env node
/**
 * Local Android release APK (no EAS / no cloud).
 *
 * Needs: JDK 17+, Android SDK, ANDROID_HOME, and an emulator or nothing
 * (assembleRelease only builds; it does not install).
 *
 * Usage (from repo root):
 *   pnpm --filter @tele-pendant/mobile apk:release
 *
 * Env:
 *   OTA_PUBLIC_URL  — written into app.json updates.url for this build
 *                     (default https://api.tele-pendant.jahbyte.com)
 *   PREBUILD_CLEAN=1 — pass --clean to expo prebuild
 */
import { execSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const appJsonPath = join(mobileRoot, 'app.json');
const androidDir = join(mobileRoot, 'android');
const outDir = join(mobileRoot, 'dist');
const defaultOta = 'https://api.tele-pendant.jahbyte.com';
const otaBase = (process.env.OTA_PUBLIC_URL ?? defaultOta).replace(/\/$/, '');
const updatesUrl = `${otaBase}/ota/manifest`;

function run(command, opts = {}) {
  console.log(`\n$ ${command}`);
  execSync(command, {
    cwd: mobileRoot,
    stdio: 'inherit',
    env: process.env,
    ...opts,
  });
}

function resolveAndroidSdk() {
  if (process.env.ANDROID_HOME && existsSync(process.env.ANDROID_HOME)) {
    return process.env.ANDROID_HOME;
  }
  if (process.env.ANDROID_SDK_ROOT && existsSync(process.env.ANDROID_SDK_ROOT)) {
    return process.env.ANDROID_SDK_ROOT;
  }
  const home = process.env.HOME ?? '';
  const candidates = [
    join(home, 'Library/Android/sdk'),
    join(home, 'Android/Sdk'),
    '/usr/local/share/android-sdk',
    '/opt/android-sdk',
  ];
  return candidates.find((path) => existsSync(path)) ?? null;
}

const androidSdk = resolveAndroidSdk();
if (!androidSdk) {
  console.error(
    'Android SDK not found. Install Android Studio, or export ANDROID_HOME to your SDK path.',
  );
  process.exit(1);
}
process.env.ANDROID_HOME = androidSdk;
process.env.ANDROID_SDK_ROOT = androidSdk;
console.log(`ANDROID_HOME=${androidSdk}`);

const appJson = JSON.parse(readFileSync(appJsonPath, 'utf8'));
const previousUrl = appJson.expo?.updates?.url;
appJson.expo = appJson.expo ?? {};
appJson.expo.updates = {
  ...(appJson.expo.updates ?? {}),
  url: updatesUrl,
  enabled: true,
};
writeFileSync(appJsonPath, `${JSON.stringify(appJson, null, 2)}\n`);
console.log(`updates.url for this build: ${updatesUrl}`);

try {
  // Shared package must be built for Metro to resolve @tele-pendant/shared.
  run('pnpm --filter @tele-pendant/shared build', {
    cwd: resolve(mobileRoot, '../..'),
  });

  const clean = process.env.PREBUILD_CLEAN === '1' ? ' --clean' : '';
  run(`npx expo prebuild --platform android${clean}`);

  const gradlew = join(androidDir, 'gradlew');
  if (!existsSync(gradlew)) {
    throw new Error(`Missing ${gradlew}. expo prebuild did not create android/.`);
  }

  run('chmod +x gradlew', { cwd: androidDir });
  // One ABI keeps native compile smaller (disk + time). Override with
  // REACT_NATIVE_ARCHITECTURES=armeabi-v7a,arm64-v8a,x86_64 if needed.
  const abis =
    process.env.REACT_NATIVE_ARCHITECTURES?.trim() || 'arm64-v8a';
  console.log(`Building native ABIs: ${abis}`);
  run(`./gradlew assembleRelease -PreactNativeArchitectures=${abis}`, {
    cwd: androidDir,
  });

  const apkCandidates = [
    join(androidDir, 'app/build/outputs/apk/release/app-release.apk'),
    join(androidDir, 'app/build/outputs/apk/release/app-release-unsigned.apk'),
  ];
  const apk = apkCandidates.find((path) => existsSync(path));
  if (!apk) {
    throw new Error(
      'Release APK not found under android/app/build/outputs/apk/release/',
    );
  }

  mkdirSync(outDir, { recursive: true });
  const dest = join(outDir, 'tele-pendant-release.apk');
  copyFileSync(apk, dest);
  console.log(`\nAPK ready: ${dest}`);
  console.log(`Source: ${apk}`);
  console.log(
    'Install: adb install -r apps/mobile/dist/tele-pendant-release.apk',
  );
  console.log(
    'Default signing is the debug keystore unless you configured a release keystore.',
  );
} finally {
  if (previousUrl !== undefined) {
    appJson.expo.updates.url = previousUrl;
    writeFileSync(appJsonPath, `${JSON.stringify(appJson, null, 2)}\n`);
    console.log(`Restored updates.url to ${previousUrl}`);
  }
}
