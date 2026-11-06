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

1. Point `expo.updates.url` in `apps/mobile/app.json` at the live manifest for production builds: `https://api.example.com/ota/manifest` (local LAN for lab builds).
2. From `apps/mobile`, publish with the local command (no EAS account):

```bash
OTA_PUBLIC_URL=https://api.example.com pnpm --filter @tele-pendant/mobile ota:export
```

That runs `expo export` and writes a protocol-1 `manifest.json` plus the bundle into `apps/api/ota`. The API already serves that folder.
3. Camera and on-device speech are native modules. They are not in Expo Go. A JS update does not add them. Rebuild the native app with `pnpm handover:mobile` ([MOBILE_RELEASE.md](./MOBILE_RELEASE.md)); signed installables are not stored in git.
4. `runtimeVersion.policy: appVersion` ties updates to the binary version (`0.0.1`).

## Acceptance clarity

| Update type | Covered by OTA? |
| ----------- | --------------- |
| JS / React Native logic, assets, UI copy | Yes; publish with `ota:export` |
| Native modules (camera, speech, new native deps) | **No**: rebuild and reinstall the APK |
| API / PLC / docs on the server | Redeploy API / containers (`deploy.sh`), not Expo OTA |

This product does **not** claim full native binary OTA. JS OTA is the supported self-hosted path without a paid Expo subscription.

## Checklist

- [ ] HTTPS on VPS (`APP_URL` / `FRONTEND_URL` are the live hosts)
- [ ] Live manifest reachable: https://api.example.com/ota/manifest
- [ ] Fallback: if OTA fails, app still boots from embedded bundle (`fallbackToCacheTimeout: 0`)
- [ ] Document update channel in `MAINTENANCE.md`
- [ ] Reviewers understand native camera/speech changes need APK rebuild
