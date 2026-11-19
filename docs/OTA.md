# Self-hosted OTA (no paid Expo subscription required)

## Web

Redeploy static assets / containers:

```bash
./deploy.sh
# or: pnpm docker:prod
```

Browsers pick up new JS/CSS after hard refresh. Prefer short cache headers on `index.html` in nginx.

## Expo (JS/asset updates)

The API serves a small folder with no login:

| Environment | Manifest | Assets |
| ----------- | -------- | ------ |
| Live | https://api.example.com/ota/manifest | https://api.example.com/ota/assets/:file |
| Local | http://localhost:3010/ota/manifest | http://localhost:3010/ota/assets/:file |

Responses include `expo-protocol-version: 1` and runtime version `0.0.1`.

### Code signing (TP-43)

Release apps embed `apps/mobile/certs/certificate.pem` (`expo.updates.codeSigningCertificate` + `codeSigningMetadata`). When the client sends `expo-expect-signature`, the API signs the raw `manifest.json` bytes and returns `expo-signature` (`sig=…, keyid="main", alg="rsa-v1_5-sha256"`). Without a private key configured, that request gets **400**.

Private key (never commit):

- `apps/mobile/signing/ota/private-key.pem` on the build machine, and/or
- `apps/api/ota/private-key.pem` on the API host, or
- `OTA_CODE_SIGNING_PRIVATE_KEY` / `OTA_CODE_SIGNING_PRIVATE_KEY_PATH`

Generate keys once from `apps/mobile` (see `apps/mobile/signing/ota/README.md`). Fake or unsigned manifests are rejected by the client when code signing is enabled.

1. Set `OTA_PUBLIC_URL` to your API origin. `apps/mobile/app.config.js` sets `expo.updates.url` to `${OTA_PUBLIC_URL}/ota/manifest`. The build fails when that variable is missing. Do not put a host in `app.json`.
2. From `apps/mobile`, publish with the local command (no EAS account):

```bash
OTA_PUBLIC_URL=https://api.example.com pnpm --filter @tele-pendant/mobile ota:export
```

That runs `expo export` and writes a protocol-1 `manifest.json` plus the bundle into `apps/api/ota`. When the OTA private key is present it also writes `manifest.signature` and copies the key for the API. The API already serves that folder and signs on demand.
3. **On-device speech** (`expo-speech-recognition`) is not in Expo Go — Listen needs a signed native app or local native debug build. **Camera** (`expo-camera`) is available in Expo Go for QR / face preview. A JS OTA does not add new native modules. Rebuild the native app with `pnpm handover:mobile` ([MOBILE_RELEASE.md](./MOBILE_RELEASE.md)); signed installables are not stored in git. Handover APKs must use the **release** keystore (`TELE_PENDANT_ANDROID_*`), not the Android debug key.
4. `runtimeVersion.policy: appVersion` ties updates to the binary version (`0.0.1`).

## Acceptance clarity

| Update type | Covered by OTA? |
| ----------- | --------------- |
| JS / React Native logic, assets, UI copy | Yes; publish with `ota:export` |
| Native modules (camera, speech, new native deps) | **No**: rebuild and reinstall the APK |
| API / PLC / docs on the server | Redeploy API / containers (`deploy.sh`), not Expo OTA |

This product does **not** claim full native binary OTA. JS OTA is the supported self-hosted path without a paid Expo subscription.

## Test an update on a phone

Use a native install (`expo run:android` or the release APK). Expo Go does not apply this OTA.

1. Confirm the installed app version is `0.0.1`. The update only applies to that version.
2. On the API machine, set `OTA_PUBLIC_URL` to the origin the phone can open, for example `http://192.168.0.192:4050` on the factory Wi-Fi or `https://api.example.com` on a TLS host.
3. Publish the current JavaScript:

```bash
OTA_PUBLIC_URL=http://192.168.0.192:4050 pnpm --filter @tele-pendant/mobile ota:export
```

4. Open `http://192.168.0.192:4050/ota/manifest` in a browser. It returns JSON with `runtimeVersion` `0.0.1`.
5. Force-close the phone app and open it again. It checks the manifest on load. A JavaScript change from that export is the running app after the reload.
6. A change to camera, speech, or the HTTP permission is not in that update. Delete `apps/mobile/android` and install a new APK for those. With the dev compose file the emulator address is `http://10.0.2.2:4050/api/v1`.

## Checklist

- [ ] HTTPS on VPS (`APP_URL` / `FRONTEND_URL` are the live hosts)
- [ ] Live manifest reachable: https://api.example.com/ota/manifest
- [ ] OTA private key on API host; `expo-signature` present when client sends `expo-expect-signature`
- [ ] Release APK signed with handover keystore (not debug); client uninstalls old debug APK first
- [ ] Fallback: if OTA fails, app still boots from embedded bundle (`fallbackToCacheTimeout: 0`)
- [ ] Document update channel in `MAINTENANCE.md`
- [ ] Reviewers understand native camera/speech changes need APK rebuild
