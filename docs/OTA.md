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

- `GET http://<api-host>:3010/ota/manifest`
- `GET http://<api-host>:3010/ota/assets/:file`

Responses include `expo-protocol-version: 1` and runtime version `0.0.1`. On this machine that is `http://localhost:3010/ota/manifest`.

1. Point `expo.updates.url` in `apps/mobile/app.json` at `http://<api-host>:3010/ota/manifest`.
2. From `apps/mobile`, publish with the local command (no EAS account):

```bash
pnpm --filter @tele-pendant/mobile ota:export
```

That runs `expo export` and writes a protocol-1 `manifest.json` plus the bundle into `apps/api/ota`. The API already serves that folder.
3. Camera and on-device speech are native modules. They are not in Expo Go. A JS update does not add them. Build a local debug binary with `npx expo run:android` inside `apps/mobile`. No cloud speech service.
4. `runtimeVersion.policy: appVersion` ties updates to the binary version (`0.0.1`).

## Checklist

- [ ] HTTPS on VPS
- [ ] Manifest URL reachable from phones
- [ ] Fallback: if OTA fails, app still boots from embedded bundle (`fallbackToCacheTimeout: 0`)
- [ ] Document update channel in `MAINTENANCE.md`
