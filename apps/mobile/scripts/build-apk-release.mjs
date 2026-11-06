#!/usr/bin/env node
/**
 * Local Android release APK (no EAS / no cloud).
 * See docs/MOBILE_RELEASE.md for signing env vars.
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  androidDir,
  logAndroidSigningNote,
  outDir,
  patchAppJsonForBuild,
  prepareAndroidNativeProject,
  runGradleRelease,
  signingGradleArgs,
} from './android-release-common.mjs';

const { hasReleaseKeystore } = signingGradleArgs();
const { restore } = patchAppJsonForBuild();

try {
  prepareAndroidNativeProject();
  runGradleRelease('assembleRelease');

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
  logAndroidSigningNote(hasReleaseKeystore);
} finally {
  restore();
}
