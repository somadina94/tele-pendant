# Self-hosted OTA (no paid Expo subscription required)

## Web

Redeploy static assets / containers:

```bash
./deploy.sh
# or: pnpm docker:prod
```

Browsers pick up new JS/CSS after hard refresh. Prefer short cache headers on `index.html` in nginx.

## Expo (JS/asset updates)

1. Set `expo.updates.url` in `apps/mobile/app.json` to your VPS, e.g. `https://pendant.example.com/ota/manifest`.
2. Host an [Expo Updates](https://docs.expo.dev/versions/latest/sdk/updates/)-compatible manifest + bundles on that path (nginx + signed update artifacts), or a custom OTA server that speaks the same protocol.
3. Rebuild the **native** binary whenever you change native modules (camera, reanimated, etc.). JS-only changes can ship via OTA.
4. `runtimeVersion.policy: appVersion` ties updates to the store/binary version.

## Checklist

- [ ] HTTPS on VPS
- [ ] Manifest URL reachable from phones
- [ ] Fallback: if OTA fails, app still boots from embedded bundle (`fallbackToCacheTimeout: 0`)
- [ ] Document update channel in `MAINTENANCE.md`
