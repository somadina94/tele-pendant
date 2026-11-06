#!/usr/bin/env node
/**
 * Local iOS release IPA (macOS + Xcode). No EAS.
 *
 * Signing: set APPLE_TEAM_ID and install cert/profile from private handover.
 * See docs/MOBILE_RELEASE.md.
 */
import { execSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadMobileEnv } from './load-env.mjs';
import { loadMobileSigningEnv } from './load-mobile-signing.mjs';

loadMobileEnv();
loadMobileSigningEnv();

if (process.platform !== 'darwin') {
  console.error('iOS release builds require macOS with Xcode.');
  process.exit(1);
}

const teamId = process.env.APPLE_TEAM_ID?.trim();
if (!teamId) {
  console.error(
    'Set APPLE_TEAM_ID (Apple Developer team ID from private handover; not in repo).',
  );
  process.exit(1);
}

const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(mobileRoot, '../..');
const appJsonPath = join(mobileRoot, 'app.json');
const iosDir = join(mobileRoot, 'ios');
const outDir = join(mobileRoot, 'dist');
const buildDir = join(mobileRoot, 'build');
const defaultOta = 'https://api.tele-pendant.jahbyte.com';
const otaBase = (process.env.OTA_PUBLIC_URL ?? defaultOta).replace(/\/$/, '');
const updatesUrl = `${otaBase}/ota/manifest`;
const apiUrl =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '') ??
  `${defaultOta}/api/v1`;
process.env.EXPO_PUBLIC_API_URL = apiUrl;

const scheme = process.env.IOS_SCHEME?.trim() || 'TelePendant';
const exportMethod = process.env.IOS_EXPORT_METHOD?.trim() || 'ad-hoc';
const profileName = process.env.IOS_PROVISIONING_PROFILE_NAME?.trim();

function run(command, opts = {}) {
  console.log(`\n$ ${command}`);
  execSync(command, {
    cwd: opts.cwd ?? mobileRoot,
    stdio: 'inherit',
    env: process.env,
    ...opts,
  });
}

function findWorkspace() {
  if (!existsSync(iosDir)) return null;
  const entries = execSync('ls ios', { cwd: mobileRoot, encoding: 'utf8' })
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const ws = entries.find((name) => name.endsWith('.xcworkspace'));
  return ws ? join(iosDir, ws) : null;
}

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
console.log(`EXPO_PUBLIC_API_URL=${apiUrl}`);

try {
  run('pnpm --filter @tele-pendant/shared build', { cwd: repoRoot });

  const clean = process.env.PREBUILD_CLEAN === '1' ? ' --clean' : '';
  run(`npx expo prebuild --platform ios${clean}`);

  const workspace = findWorkspace();
  if (!workspace) {
    throw new Error('No .xcworkspace under ios/ after prebuild.');
  }

  mkdirSync(buildDir, { recursive: true });
  const archivePath = join(buildDir, 'TelePendant.xcarchive');
  rmSync(archivePath, { recursive: true, force: true });

  const teamArg = `DEVELOPMENT_TEAM=${teamId}`;
  run(
    `xcodebuild -workspace "${workspace}" -scheme "${scheme}" -configuration Release -archivePath "${archivePath}" ${teamArg} -allowProvisioningUpdates archive`,
    { cwd: mobileRoot },
  );

  const exportDir = join(buildDir, 'export');
  rmSync(exportDir, { recursive: true, force: true });
  mkdirSync(exportDir, { recursive: true });

  const exportPlist = join(buildDir, 'ExportOptions.plist');
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>${exportMethod}</string>
  <key>teamID</key>
  <string>${teamId}</string>
  <key>signingStyle</key>
  <string>${profileName ? 'manual' : 'automatic'}</string>
${
  profileName
    ? `  <key>provisioningProfiles</key>
  <dict>
    <key>com.telependant.app</key>
    <string>${profileName}</string>
  </dict>
`
    : ''
}
</dict>
</plist>
`;
  writeFileSync(exportPlist, plist);

  run(
    `xcodebuild -exportArchive -archivePath "${archivePath}" -exportPath "${exportDir}" -exportOptionsPlist "${exportPlist}" -allowProvisioningUpdates`,
    { cwd: mobileRoot },
  );

  const ipaCandidates = execSync(`find "${exportDir}" -name '*.ipa'`, {
    encoding: 'utf8',
  })
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const ipa = ipaCandidates[0];
  if (!ipa) {
    throw new Error(`No .ipa under ${exportDir}`);
  }

  mkdirSync(outDir, { recursive: true });
  const dest = join(outDir, 'tele-pendant-release.ipa');
  copyFileSync(ipa, dest);
  console.log(`\nIPA ready: ${dest}`);
  console.log(`Source: ${ipa}`);
} finally {
  if (previousUrl !== undefined) {
    appJson.expo.updates.url = previousUrl;
    writeFileSync(appJsonPath, `${JSON.stringify(appJson, null, 2)}\n`);
    console.log(`Restored updates.url to ${previousUrl}`);
  }
}
