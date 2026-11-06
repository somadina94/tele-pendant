import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadMobileEnv } from './load-env.mjs';
import { loadMobileSigningEnv } from './load-mobile-signing.mjs';

loadMobileEnv();
loadMobileSigningEnv();

export const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const repoRoot = resolve(mobileRoot, '../..');
export const appJsonPath = join(mobileRoot, 'app.json');
export const androidDir = join(mobileRoot, 'android');
export const outDir = join(mobileRoot, 'dist');

const defaultOta = 'https://api.tele-pendant.jahbyte.com';

export function run(command, opts = {}) {
  console.log(`\n$ ${command}`);
  execSync(command, {
    cwd: mobileRoot,
    stdio: 'inherit',
    env: process.env,
    ...opts,
  });
}

export function resolveAndroidSdk() {
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

export function signingGradleArgs() {
  const ks = process.env.TELE_PENDANT_ANDROID_KEYSTORE?.trim();
  const ksPass = process.env.TELE_PENDANT_ANDROID_KEYSTORE_PASSWORD;
  const keyAlias = process.env.TELE_PENDANT_ANDROID_KEY_ALIAS?.trim();
  const keyPass = process.env.TELE_PENDANT_ANDROID_KEY_PASSWORD ?? ksPass;
  const signingProps = [];
  if (ks && keyAlias && ksPass) {
    signingProps.push(
      `-PMYAPP_UPLOAD_STORE_FILE=${ks}`,
      `-PMYAPP_UPLOAD_STORE_PASSWORD=${ksPass}`,
      `-PMYAPP_UPLOAD_KEY_ALIAS=${keyAlias}`,
      `-PMYAPP_UPLOAD_KEY_PASSWORD=${keyPass}`,
    );
    console.log('Using release keystore from TELE_PENDANT_ANDROID_* env vars.');
  }
  return { signingProps, hasReleaseKeystore: Boolean(ks && keyAlias && ksPass) };
}

export function patchAppJsonForBuild() {
  const otaBase = (process.env.OTA_PUBLIC_URL ?? defaultOta).replace(/\/$/, '');
  const updatesUrl = `${otaBase}/ota/manifest`;
  const apiUrl =
    process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '') ??
    `${defaultOta}/api/v1`;
  process.env.EXPO_PUBLIC_API_URL = apiUrl;
  console.log(`EXPO_PUBLIC_API_URL=${apiUrl}`);

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

  return {
    appJson,
    previousUrl,
    restore() {
      if (previousUrl !== undefined) {
        appJson.expo.updates.url = previousUrl;
        writeFileSync(appJsonPath, `${JSON.stringify(appJson, null, 2)}\n`);
        console.log(`Restored updates.url to ${previousUrl}`);
      }
    },
  };
}

export function prepareAndroidNativeProject() {
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

  run('pnpm --filter @tele-pendant/shared build', { cwd: repoRoot });

  const clean = process.env.PREBUILD_CLEAN === '1' ? ' --clean' : '';
  run(`npx expo prebuild --platform android${clean}`);

  const gradlew = join(androidDir, 'gradlew');
  if (!existsSync(gradlew)) {
    throw new Error(`Missing ${gradlew}. expo prebuild did not create android/.`);
  }
  run('chmod +x gradlew', { cwd: androidDir });

  run(
    'npx expo export:embed --platform android --entry-file index.js --bundle-output /tmp/tele-pendant-release.bundle --assets-dest /tmp/tele-pendant-release-assets --dev false --minify true',
  );
}

export function runGradleRelease(gradleTask) {
  const abis =
    process.env.REACT_NATIVE_ARCHITECTURES?.trim() || 'arm64-v8a';
  console.log(`Building native ABIs: ${abis}`);
  const { signingProps } = signingGradleArgs();
  run(
    `./gradlew ${gradleTask} -PreactNativeArchitectures=${abis} ${signingProps.join(' ')}`.trim(),
    {
      cwd: androidDir,
      env: {
        ...process.env,
        NODE_OPTIONS: [process.env.NODE_OPTIONS, '--no-warnings']
          .filter(Boolean)
          .join(' '),
      },
    },
  );
}

export function logAndroidSigningNote(hasReleaseKeystore) {
  console.log(
    hasReleaseKeystore
      ? 'Signed with TELE_PENDANT_ANDROID_KEYSTORE (handover release keystore).'
      : 'Signed with debug keystore; set TELE_PENDANT_ANDROID_* for release signing (docs/MOBILE_RELEASE.md).',
  );
}
