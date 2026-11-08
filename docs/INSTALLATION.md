# Tele-Pendant: Installation

## Live hosts

| Surface | URL |
| ------- | --- |
| Web HMI | https://hmi.example.com |
| API | https://api.example.com |
| Health | https://api.example.com/api/v1/health |
| Swagger | Not mounted when `NODE_ENV=production` (local Docker: http://localhost:3010/api) |
| OTA | https://api.example.com/ota/manifest |

```env
APP_URL=https://api.example.com
FRONTEND_URL=https://hmi.example.com
COOKIE_SECURE=true
```

## Requirements

- Node 22+, pnpm 9.15
- Docker (recommended for VPS)
- Open ports: API host `PORT` (maps to container `3010`), Modbus sim `1502` (internal), web host `WEB_PORT` (maps to container `80`)

## Host install

```bash
git clone <repo> tele-pendant && cd tele-pendant
cp .env.example .env
# edit JWT_SECRET, ADMIN_PASSWORD, SAFE_ACTION_PIN
pnpm install
pnpm --filter @tele-pendant/shared build
pnpm --filter @tele-pendant/modbus-core build
pnpm --filter @tele-pendant/modbus-sim dev   # terminal 1
pnpm --filter @tele-pendant/api start:dev    # terminal 2
pnpm --filter @tele-pendant/web dev          # terminal 3
```

## Docker local (dev)

```bash
cp .env.example .env
pnpm docker:dev
# or: pnpm docker:dev:watch
```

## Docker production

```bash
cp .env.example .env
# Manual GHCR pull on the server — set in .env:
#   GHCR_USERNAME=<github user>
#   GHCR_PULL_TOKEN=<PAT with read:packages>
# Optional: TELE_PENDANT_{API,SIM,WEB}_IMAGE=ghcr.io/somadina94/tele-pendant-*:latest
./deploy.sh
# fallback (build on server): DEPLOY_BUILD_LOCAL=1 ./deploy.sh
```

`deploy.sh` logs in to GHCR, prunes stopped/idle containers and unused images before/after pull, then recreates the stack.

## Database migrations (upgrades)

TypeORM migrations live in `apps/api/src/database/migrations/`. `DATABASE_SYNC` stays off in production. After pulling a release that adds migrations (for example `1762380000000-AddUserSuspended` for account suspension), run:

```bash
pnpm --filter @tele-pendant/api build
pnpm --filter @tele-pendant/api migration:run
```

Restart the API container or process. Fresh installs seed the admin user; existing SQLite files need `migration:run` when the repo adds columns.

## GitHub secrets

`SERVER_HOST`, `SERVER_USERNAME`, `SERVER_PORT`, `SERVER_PASSWORD` and/or `SERVER_SSH_KEY`, optional `SERVER_DEPLOY_PATH`.

## Expo

```bash
pnpm --filter @tele-pendant/mobile dev
```

API base comes from `MOBILE_API_URL` / `EXPO_PUBLIC_API_URL` (see root `.env.example` and `apps/mobile/app.config.js`). On a physical phone use the live API (`https://api.example.com/api/v1`) or your Mac’s LAN URL ending in `/api/v1` (not `127.0.0.1`).

**Expo Go (Android / iOS):** install Expo Go matching the project SDK (currently **58**), same Wi‑Fi as the Metro host, then open the `exp://…` URL Metro prints (or scan the QR). Confirmed path for smoke: sign-in UI against the configured API. **Listen** (on-device speech) is **not** in Expo Go — use a signed native build or `expo run:android` / Xcode. Camera / QR / face preview use `expo-camera` and work in Expo Go when the device grants camera permission.

**iOS Simulator:** `pnpm --filter @tele-pendant/mobile exec expo start --ios` installs Expo Go into the booted simulator when needed. Prefer `exp://127.0.0.1:8081` on the simulator; use the LAN `exp://` URL on a physical iPhone.

### Handover native builds (Android + iOS)

Signed installables and signing keys are **not in git**. The vendor sends a signed **APK** and **IPA** securely when you need them, plus keystore / Apple signing material privately. To rebuild later, use the repo scripts (full detail in [MOBILE_RELEASE.md](./MOBILE_RELEASE.md)):

```bash
pnpm handover:mobile              # APK + AAB + iOS IPA
pnpm handover:mobile:apk          # side-load APK
pnpm handover:mobile:aab          # Play Store bundle
pnpm handover:mobile:android      # APK + AAB
pnpm handover:mobile:ios          # macOS + Xcode only
```

Outputs under `apps/mobile/dist/` (gitignored): `tele-pendant-release.apk`, `tele-pendant-release.aab`, `tele-pendant-release.ipa`.

Android needs JDK 17+, Android SDK, and `ANDROID_HOME`. iOS needs macOS, Xcode, and `APPLE_TEAM_ID` (and cert/profile from handover). Set `TELE_PENDANT_ANDROID_*` env vars for release APK/AAB signing when the vendor shared a keystore (required for handover builds; `ALLOW_DEBUG_SIGNING=1` is lab-only).

A full native release needs several GB free. If Gradle fails mid-C++ with a vague ninja error, check `df -h`; a full disk is a common cause.

Debug binary (installs to a device/emulator):

```bash
pnpm --filter @tele-pendant/mobile exec expo run:android
```

Publish a JS-only OTA update with no EAS account:

```bash
OTA_PUBLIC_URL=https://api.example.com pnpm --filter @tele-pendant/mobile ota:export
```

Optional OPC UA simulator (Modbus on port 1502 stays the default):

```bash
docker compose -f docker-compose.dev.yml --profile opcua up --build opcua-sim
```

TLS stays on your reverse proxy and certificate. The web container sends `Strict-Transport-Security` (HSTS, `max-age=31536000; includeSubDomains`), `X-Frame-Options: DENY`, `Content-Security-Policy: frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, and `Referrer-Policy: no-referrer`. Keep `X-Forwarded-Proto https` on the host proxy so apps see TLS correctly; do not strip the HSTS header from the upstream web container. Swagger is not mounted when `NODE_ENV=production`. The API already sets Helmet, JWT auth/roles, and request rate limits (stricter on `/auth/login` and face routes).

### Security checklist

- Set strong `JWT_SECRET`, `ADMIN_PASSWORD`, `SAFE_ACTION_PIN`, and `FACE_TEMPLATE_KEY` (32+ chars) before production. With `NODE_ENV=production`, the API **refuses to boot** if any of those still match the documented `.env.example` demo defaults (TP-50).
- `COOKIE_SECURE=true` when serving HTTPS.
- Face templates are encrypted at rest when `FACE_TEMPLATE_KEY` is set; they are never returned to clients.
- Software deadman/e-stop/watchdog supervise the HMI path only; not SIL. See `REAL_PLC_WIRING.md` for **step-by-step real PLC registration** (example values and where to get host, port, unit id, and register addresses from the machine).

## HTTPS hostnames (production)

Example public hosts:

- Web SPA: `https://hmi.example.com` → host nginx → `127.0.0.1:$WEB_PORT` (container port 80)
- API + Swagger/docs: `https://api.example.com` → host nginx → `127.0.0.1:$PORT` (container port 3010)

Each hostname needs its **own** certificate (or one cert with both names in SAN). If `hmi.example.com` presents a cert whose CN/SAN is only `api.example.com`, browsers refuse HTTPS and curl reports `subjectAltName does not match`.

Issue / renew both names, for example:

```bash
sudo certbot --nginx -d hmi.example.com -d api.example.com
```

Or two separate server blocks, each with its own cert, each `proxy_pass` to the matching localhost port from `.env`.

The SPA calls `/api/v1` and Socket.IO on the **same origin** as the web page. The web container nginx already proxies `/api/` and `/socket.io/` to `http://api:3010` on the Docker network, so the host TLS vhost only needs to forward to `$WEB_PORT` (see [`deploy/host-nginx-hmi.example.conf`](../deploy/host-nginx-hmi.example.conf)). Keep `Upgrade` / `Connection` headers so WebSocket upgrades work through the terminator.

Set in server `.env`:

```env
APP_URL=https://api.example.com
FRONTEND_URL=https://hmi.example.com
COOKIE_SECURE=true
```
