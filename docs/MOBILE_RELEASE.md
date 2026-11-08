# Mobile native builds (handover)

Signed **Android** (APK / AAB) and **iOS** (IPA) installables are **not stored in this repository**. At handover you receive:

- **Signed builds** when you need to install or publish (delivered over a secure channel, not git).
- **Signing credentials** separately (Android keystore, Apple team/cert/profile material), also **never committed**.
- Scripts in this repo to **produce new APK, AAB, and IPA** on your machine once credentials are configured locally.

Until you install a native build, operators can use the **web HMI** on iPhone/Android browsers (https://hmi.example.com), or smoke the Expo project in **Expo Go** (SDK 58) via `pnpm --filter @tele-pendant/mobile dev` — see [INSTALLATION.md](./INSTALLATION.md). Expo Go is not a substitute for the signed APK/IPA at handover; **Listen** still needs a native binary.

**TP-49 (session security):** release builds store the JWT in **expo-secure-store** (not plaintext AsyncStorage) and set Android **`allowBackup: false`** in `app.json` so app data is not auto-backed up to Google Drive. Rebuild the native binary after pulling that change.

## Build scripts (repo)

From the repository root:

| Command | Output |
| ------- | ------ |
| `pnpm handover:mobile:apk` | `apps/mobile/dist/tele-pendant-release.apk` |
| `pnpm handover:mobile:aab` | `apps/mobile/dist/tele-pendant-release.aab` (Play Console) |
| `pnpm handover:mobile:ios` | `apps/mobile/dist/tele-pendant-release.ipa` (macOS + Xcode) |
| `pnpm handover:mobile:android` | APK + AAB |
| `pnpm handover:mobile` | APK + AAB + iOS (all three) |

Underlying mobile package scripts:

- `pnpm --filter @tele-pendant/mobile apk:release`
- `pnpm --filter @tele-pendant/mobile aab:release`
- `pnpm --filter @tele-pendant/mobile ios:release`

See [INSTALLATION.md](./INSTALLATION.md) for JDK, Android SDK, and Xcode requirements.

## Signing package folder (gitignored)

Use **`apps/mobile/signing/`** on the build machine:

| Path | Purpose |
| ---- | ------- |
| `signing/android/*.keystore` or `*.jks` | Android release keystore |
| `signing/ios/*.p12`, `*.mobileprovision` | iOS cert and profile |
| `signing/ota/private-key.pem` | Expo Updates OTA code-signing private key (TP-43) |
| `signing/credentials.env` | Passwords, alias, `APPLE_TEAM_ID` (copy from `credentials.example.env`) |

Only `README.md`, `credentials.example.env`, `signing/ota/README.md`, and empty `android/` / `ios/` / `ota/` placeholders are tracked in git. **Secrets and keystores are never committed.** The public OTA certificate is tracked at `apps/mobile/certs/certificate.pem`.

Zip for secure transfer:

```bash
pnpm handover:mobile:signing-zip
# → apps/mobile/dist/mobile-signing-handover.zip (gitignored)
```

Unpack on the recipient machine into `apps/mobile/signing/`. Build scripts load `credentials.env` automatically.

You can still set the same values via shell environment variables instead of `credentials.env`.

## Signing material (private handover)

Keep keystore files **outside git**. Default location: `apps/mobile/signing/` as above, or custom paths in env vars.

### Android (APK and AAB)

| Variable | Purpose |
| -------- | ------- |
| `TELE_PENDANT_ANDROID_KEYSTORE` | Path to release `.jks` / `.keystore` (from vendor) |
| `TELE_PENDANT_ANDROID_KEYSTORE_PASSWORD` | Keystore password |
| `TELE_PENDANT_ANDROID_KEY_ALIAS` | Key alias |
| `TELE_PENDANT_ANDROID_KEY_PASSWORD` | Key password |

**TP-43:** `apk:release` / `aab:release` **require** these vars (handover release keystore). The build scripts patch `android/app/build.gradle` so release uses `MYAPP_UPLOAD_*` (Expo prebuild defaults to the debug keystore). After build, `apksigner verify --print-certs` must **not** show `CN=Android Debug`. Client must uninstall any debug-signed Dropbox APK before installing the release build. Lab-only escape hatch: `ALLOW_DEBUG_SIGNING=1` (never for client handover).

### iOS

| Variable | Purpose |
| -------- | ------- |
| `APPLE_TEAM_ID` | Apple Developer team ID |
| `IOS_SCHEME` | Xcode scheme (default `TelePendant`) |
| `IOS_EXPORT_METHOD` | `ad-hoc`, `enterprise`, or `app-store` (default `ad-hoc`) |
| `IOS_PROVISIONING_PROFILE_NAME` | Optional; name of the distribution profile installed in Xcode |

Install the **distribution certificate** and **provisioning profile** the vendor sent you into your login keychain / Xcode before running `ios:release`.

#### Apple Developer account (what to obtain)

These items come from [Apple Developer](https://developer.apple.com) (paid **Apple Developer Program** membership on the owning team). None of them belong in git; use `apps/mobile/signing/ios/` and secure handover (`pnpm handover:mobile:signing-zip`).

| Item | Where / notes |
| ---- | ------------- |
| **Team ID** | Membership details → copy into `APPLE_TEAM_ID` in `credentials.env` |
| **Bundle ID** | Register **`com.telependant.app`** (matches `app.json`); enable **Camera** and **Speech** if you use QR, Face, or Listen on device |
| **Apple Distribution certificate** | Certificates → create, install on Mac, export **`.p12`** (+ password) into `signing/ios/` |
| **Provisioning profile** | Profiles → **Ad Hoc** (default): register each device **UDID**, profile for `com.telependant.app` → **`.mobileprovision`**. **App Store**: app in App Store Connect + App Store distribution profile for TestFlight or store upload |
| **Build host** | **macOS** with **Xcode**; Apple ID in Xcode → Settings → Accounts; import `.p12` and profile before `pnpm handover:mobile:ios` |

Until an IPA is built and installed, iPhone users can use the **web HMI in Safari** or **Expo Go** for smoke (see [USER_MANUAL.md](./USER_MANUAL.md) and [INSTALLATION.md](./INSTALLATION.md)).

## OTA and API URL for a build

```bash
OTA_PUBLIC_URL=https://api.example.com \
EXPO_PUBLIC_API_URL=https://api.example.com/api/v1 \
  pnpm handover:mobile
```

Optional: `PREBUILD_CLEAN=1` for a clean native project.

## OTA code signing (TP-43)

Release binaries embed `apps/mobile/certs/certificate.pem` so Expo Updates rejects unsigned / wrong-key manifests. On the API host, place the matching private key at `apps/api/ota/private-key.pem` (or set `OTA_CODE_SIGNING_PRIVATE_KEY` / `OTA_CODE_SIGNING_PRIVATE_KEY_PATH`). `ota:export` copies/signs when the private key is present. Details: [OTA.md](./OTA.md).

## What ships in git vs securely

| Item | In repo? |
| ---- | -------- |
| Source, Expo config, build scripts | Yes |
| Public OTA code-signing certificate (`certs/certificate.pem`) | Yes |
| Signed `.apk`, `.aab`, `.ipa` | **No** (gitignored under `apps/mobile/dist/`) |
| Keystores, `.p12`, provisioning profiles, OTA private key | **No** |
| Vendor-provided signed installables at handover | **No** (secure transfer) |

JavaScript-only updates still use [OTA.md](./OTA.md). Camera, speech, or other native changes require a **new native build** using the scripts above.
