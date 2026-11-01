# Tele-Pendant — Installation

## Requirements

- Node 22+, pnpm 9.15
- Docker (recommended for VPS)
- Open ports: API `3010`, Modbus sim `1502` (internal), web `5173` or `8080`

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

On a physical phone, set API base to your LAN/VPS URL (not `127.0.0.1`). Configure `expo.updates.url` in `apps/mobile/app.json` for self-hosted OTA.

Publish a JS update with no EAS account:

```bash
pnpm --filter @tele-pendant/mobile ota:export
```

Camera and speech are native. Expo Go cannot load them. Use `npx expo run:android` inside `apps/mobile` for a local debug binary.

Optional OPC UA simulator (Modbus on port 1502 stays the default):

```bash
docker compose -f docker-compose.dev.yml --profile opcua up --build opcua-sim
```

TLS stays on your reverse proxy and certificate. The API already sets Helmet and a request limit.
