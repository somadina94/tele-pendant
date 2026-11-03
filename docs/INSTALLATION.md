# Tele-Pendant — Installation

## Live hosts

| Surface | URL |
| ------- | --- |
| Web HMI | https://tele-pendant.jahbyte.com |
| API | https://api.tele-pendant.jahbyte.com |
| Health | https://api.tele-pendant.jahbyte.com/api/v1/health |
| Swagger | https://api.tele-pendant.jahbyte.com/api |
| OTA | https://api.tele-pendant.jahbyte.com/ota/manifest |

```env
APP_URL=https://api.tele-pendant.jahbyte.com
FRONTEND_URL=https://tele-pendant.jahbyte.com
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
# set TELE_PENDANT_*_IMAGE or use deploy.sh after CI push
./deploy.sh
# fallback: DEPLOY_BUILD_LOCAL=1 ./deploy.sh
```

## GitHub secrets

`SERVER_HOST`, `SERVER_USERNAME`, `SERVER_PORT`, `SERVER_PASSWORD` and/or `SERVER_SSH_KEY`, optional `SERVER_DEPLOY_PATH`.

## Expo

```bash
pnpm --filter @tele-pendant/mobile dev
```

On a physical phone, set API base to the live API (`https://api.tele-pendant.jahbyte.com/api/v1`) or your LAN URL (not `127.0.0.1`).

### Local release APK (no EAS)

Needs JDK 17+, Android SDK, and `ANDROID_HOME`.

```bash
# From repo root — writes apps/mobile/dist/tele-pendant-release.apk
pnpm --filter @tele-pendant/mobile apk:release

# Optional: force a clean native project, or point OTA at another host
PREBUILD_CLEAN=1 OTA_PUBLIC_URL=https://api.tele-pendant.jahbyte.com \
  pnpm --filter @tele-pendant/mobile apk:release

adb install -r apps/mobile/dist/tele-pendant-release.apk
```

The script runs `expo prebuild` then `./gradlew assembleRelease` for **arm64-v8a** only (set `REACT_NATIVE_ARCHITECTURES` for more ABIs). It temporarily sets `updates.url` to `$OTA_PUBLIC_URL/ota/manifest` (default live API). Signing uses the debug keystore until you add a release keystore.

A full native release needs several GB free. If Gradle fails mid-C++ with a vague ninja error, check `df -h` — a full disk is a common cause.

Debug binary (installs to a device/emulator):

```bash
pnpm --filter @tele-pendant/mobile exec expo run:android
```

Publish a JS-only OTA update with no EAS account:

```bash
OTA_PUBLIC_URL=https://api.tele-pendant.jahbyte.com pnpm --filter @tele-pendant/mobile ota:export
```

Optional OPC UA simulator (Modbus on port 1502 stays the default):

```bash
docker compose -f docker-compose.dev.yml --profile opcua up --build opcua-sim
```

TLS stays on your reverse proxy and certificate. The API already sets Helmet, JWT auth/roles, and request rate limits (stricter on `/auth/login` and face routes).

### Security checklist

- Set strong `JWT_SECRET`, `ADMIN_PASSWORD`, `SAFE_ACTION_PIN`, and `FACE_TEMPLATE_KEY` (32+ chars) before production.
- `COOKIE_SECURE=true` when serving HTTPS.
- Face templates are encrypted at rest when `FACE_TEMPLATE_KEY` is set; they are never returned to clients.
- Software deadman/e-stop/watchdog supervise the HMI path only — not SIL. See `REAL_PLC_WIRING.md`.

## HTTPS hostnames (production)

Example public hosts:

- Web SPA: `https://tele-pendant.jahbyte.com` → host nginx → `127.0.0.1:$WEB_PORT` (container port 80)
- API + Swagger/docs: `https://api.tele-pendant.jahbyte.com` → host nginx → `127.0.0.1:$PORT` (container port 3010)

Each hostname needs its **own** certificate (or one cert with both names in SAN). If `tele-pendant.jahbyte.com` presents a cert whose CN/SAN is only `api.tele-pendant.jahbyte.com`, browsers refuse HTTPS and curl reports `subjectAltName does not match`.

Issue / renew both names, for example:

```bash
sudo certbot --nginx -d tele-pendant.jahbyte.com -d api.tele-pendant.jahbyte.com
```

Or two separate server blocks, each with its own cert, each `proxy_pass` to the matching localhost port from `.env`.

The SPA calls `/api/v1` on the **same origin** as the web page. Either:

1. Proxy `/api/` and `/socket.io/` on the web vhost to the API (the web container nginx already does this to `http://api:3010` on the Docker network), or
2. Proxy those paths on the host nginx for `tele-pendant.jahbyte.com` to `127.0.0.1:$PORT`.

Set in server `.env`:

```env
APP_URL=https://api.tele-pendant.jahbyte.com
FRONTEND_URL=https://tele-pendant.jahbyte.com
COOKIE_SECURE=true
```
