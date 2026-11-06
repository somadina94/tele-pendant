#!/usr/bin/env node
/**
 * Local Android App Bundle (AAB) for Play Console upload (no EAS / no cloud).
 * Requires release keystore (TELE_PENDANT_ANDROID_*) for store-ready bundles.
 * See docs/MOBILE_RELEASE.md.
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
if (!hasReleaseKeystore) {
  console.warn(
    'Warning: TELE_PENDANT_ANDROID_* not set. bundleRelease may produce an unsigned or debug-signed AAB unsuitable for Play upload.',
  );
}

const { restore } = patchAppJsonForBuild();

try {
  prepareAndroidNativeProject();
  runGradleRelease('bundleRelease');

  const aabCandidates = [
    join(androidDir, 'app/build/outputs/bundle/release/app-release.aab'),
  ];
  const aab = aabCandidates.find((path) => existsSync(path));
  if (!aab) {
    throw new Error(
      'Release AAB not found under android/app/build/outputs/bundle/release/',
    );
  }

  mkdirSync(outDir, { recursive: true });
  const dest = join(outDir, 'tele-pendant-release.aab');
  copyFileSync(aab, dest);
  console.log(`\nAAB ready: ${dest}`);
  console.log(`Source: ${aab}`);
  console.log('Upload this file to Google Play Console (internal testing or production).');
  logAndroidSigningNote(hasReleaseKeystore);
} finally {
  restore();
}
