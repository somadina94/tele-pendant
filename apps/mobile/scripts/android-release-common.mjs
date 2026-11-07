import { execSync } from 'node:child_process';
import {
  existsSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
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
  const hasReleaseKeystore = Boolean(ks && keyAlias && ksPass);
  const allowDebug = process.env.ALLOW_DEBUG_SIGNING === '1';
  // TP-43: release APK/AAB must use the handover keystore unless explicitly opted out.
  if (!hasReleaseKeystore && !allowDebug) {
    throw new Error(
      'TELE_PENDANT_ANDROID_KEYSTORE / KEYSTORE_PASSWORD / KEY_ALIAS are required for release builds (TP-43). Set ALLOW_DEBUG_SIGNING=1 only for local side-load experiments. See docs/MOBILE_RELEASE.md.',
    );
  }
  const signingProps = [];
  if (hasReleaseKeystore) {
    signingProps.push(
      `-PMYAPP_UPLOAD_STORE_FILE=${ks}`,
      `-PMYAPP_UPLOAD_STORE_PASSWORD=${ksPass}`,
      `-PMYAPP_UPLOAD_KEY_ALIAS=${keyAlias}`,
      `-PMYAPP_UPLOAD_KEY_PASSWORD=${keyPass}`,
    );
    console.log('Using release keystore from TELE_PENDANT_ANDROID_* env vars.');
  } else {
    console.warn(
      'ALLOW_DEBUG_SIGNING=1: building with the Android debug keystore (not for client handover).',
    );
  }
  return { signingProps, hasReleaseKeystore };
}

/**
 * Expo prebuild leaves release signed with the debug keystore. Wire the
 * standard MYAPP_UPLOAD_* Gradle properties (passed via -P) so release APKs
 * use the handover keystore (TP-43).
 */
export function ensureAndroidReleaseSigningGradle(
  useReleaseKeystore = true,
) {
  const gradlePath = join(androidDir, 'app/build.gradle');
  if (!existsSync(gradlePath)) {
    throw new Error(`Missing ${gradlePath}. Run expo prebuild first.`);
  }
  let source = readFileSync(gradlePath, 'utf8');

  if (!source.includes('MYAPP_UPLOAD_STORE_FILE')) {
    const marker =
      "            keyPassword 'android'\n        }\n    }\n    buildTypes {";
    if (!source.includes(marker)) {
      throw new Error(
        `Could not locate signingConfigs.debug in ${gradlePath} to add release signing (TP-43).`,
      );
    }
    source = source.replace(
      marker,
      `            keyPassword 'android'
        }
        release {
            if (project.hasProperty('MYAPP_UPLOAD_STORE_FILE')) {
                storeFile file(MYAPP_UPLOAD_STORE_FILE)
                storePassword MYAPP_UPLOAD_STORE_PASSWORD
                keyAlias MYAPP_UPLOAD_KEY_ALIAS
                keyPassword MYAPP_UPLOAD_KEY_PASSWORD
            }
        }
    }
    buildTypes {`,
    );
  }

  if (useReleaseKeystore) {
    // Anchor on the Expo/RN release caution comment so we never touch debug.
    const releaseBuildTypeSigning =
      /(\/\/ Caution! In production, you need to generate your own keystore file\.\n\s*\/\/ see https:\/\/reactnative\.dev\/docs\/signed-apk-android\.\n\s*)signingConfig signingConfigs\.debug/;
    if (releaseBuildTypeSigning.test(source)) {
      source = source.replace(
        releaseBuildTypeSigning,
        '$1signingConfig signingConfigs.release',
      );
    } else if (
      !source.includes(
        '// see https://reactnative.dev/docs/signed-apk-android.\n            signingConfig signingConfigs.release',
      )
    ) {
      throw new Error(
        `Could not set release signingConfig in ${gradlePath} (TP-43).`,
      );
    }
  }

  writeFileSync(gradlePath, source);
  console.log(
    useReleaseKeystore
      ? 'Patched android/app/build.gradle for MYAPP_UPLOAD_* release signing (TP-43).'
      : 'Left release buildType on debug signing (ALLOW_DEBUG_SIGNING=1).',
  );
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
  const { hasReleaseKeystore } = signingGradleArgs();
  ensureAndroidReleaseSigningGradle(hasReleaseKeystore);

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

/** Fail the build if a supposed release APK is still debug-signed (TP-43). */
export function assertApkReleaseSigned(apkPath, requireRelease) {
  if (!requireRelease) return;
  const sdk = resolveAndroidSdk();
  if (!sdk) {
    console.warn('ANDROID_HOME missing; skipped apksigner verify.');
    return;
  }
  const buildTools = join(sdk, 'build-tools');
  if (!existsSync(buildTools)) {
    console.warn('Android build-tools missing; skipped apksigner verify.');
    return;
  }
  const versions = readdirSync(buildTools)
    .filter((name) => /^\d/.test(name))
    .sort()
    .reverse();
  const apksigner = versions
    .map((version) => join(buildTools, version, 'apksigner'))
    .find((path) => existsSync(path));
  if (!apksigner) {
    console.warn('apksigner not found; skipped cert verify.');
    return;
  }
  let report = '';
  try {
    report = execSync(`"${apksigner}" verify --print-certs "${apkPath}"`, {
      encoding: 'utf8',
      env: process.env,
    });
  } catch (error) {
    throw new Error(
      `apksigner verify failed for ${apkPath}: ${error?.message ?? error}`,
    );
  }
  console.log(report.trim());
  if (/CN=Android Debug/i.test(report)) {
    throw new Error(
      'APK is still signed with the Android Debug keystore (TP-43). android/app/build.gradle must use signingConfigs.release with MYAPP_UPLOAD_*.',
    );
  }
}
