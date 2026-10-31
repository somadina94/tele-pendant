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
2. Drop a new `manifest.json` and bundle into `apps/api/ota` (the bundle path is `apps/api/ota/assets/`). That folder is the update.
3. Rebuild the **native** binary whenever you change native modules (camera, reanimated, etc.). JS-only changes are what this folder ships.
4. `runtimeVersion.policy: appVersion` ties updates to the store/binary version (`0.0.1`).

## Checklist

- [ ] HTTPS on VPS
- [ ] Manifest URL reachable from phones
- [ ] Fallback: if OTA fails, app still boots from embedded bundle (`fallbackToCacheTimeout: 0`)
- [ ] Document update channel in `MAINTENANCE.md`
