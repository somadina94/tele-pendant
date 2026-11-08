# Tele-Pendant

Industrial-grade web/mobile tele-pendant HMI with Modbus TCP, safety supervision, and a local simulator.

## Stack

- **API:** NestJS + TypeORM (SQLite) — giftcards/server layout (Swagger, Compodoc, httpyac)
- **Web:** Vite + React + TanStack Query + Framer Motion
- **Mobile:** Expo + TanStack Query + Reanimated / Gesture Handler
- **Sim:** Modbus TCP demo crane slave
- **Docs:** manuals under [`docs/`](./docs/) (user, install, maintenance, real PLC, manual test plan, training, face limitations, OTA)

## Quick start (host)

```bash
pnpm install
cp .env.example .env
pnpm --filter @tele-pendant/shared build
pnpm --filter @tele-pendant/modbus-core build

# Terminal 1 — Modbus demo crane simulator
pnpm --filter @tele-pendant/modbus-sim dev

# Terminal 2 — API (Swagger + JWT auth + PLC)
pnpm --filter @tele-pendant/api start:dev

# Terminal 3 — Web HMI
pnpm --filter @tele-pendant/web dev
```

## Docker (same pattern as freelancer_bot/server)

```bash
cp .env.example .env

# Local test stack (API watch + sim + Vite)
pnpm docker:dev
# or with Compose Watch:
pnpm docker:dev:watch
```

**macOS + project under `~/Desktop`:** If Docker fails with `mkdir ... Desktop: operation not permitted`, allow the project in **Docker Desktop → Settings → Resources → File sharing** (add your repo path), or move the clone to e.g. `~/Developer`. Dev compose avoids bind-mounting the repo root; Compose Watch still reads files from the host for sync.

```bash
# Default compose (built prod images: api + sim + nginx web)
pnpm docker:up

# Production-style (GHCR pull / local build fallback via deploy.sh)
pnpm docker:prod
./deploy.sh
```

### GitHub secrets to set (CI deploy)

Same as freelancer_bot: `SERVER_HOST`, `SERVER_USERNAME`, `SERVER_PORT`, and either `SERVER_PASSWORD` or `SERVER_SSH_KEY`. Optional: `SERVER_DEPLOY_PATH` (default `~/tele-pendant`).

Images pushed on main: `tele-pendant-api`, `tele-pendant-sim`, `tele-pendant-web` under `ghcr.io/somadina94/`.

Manual server deploy needs `GHCR_USERNAME` + `GHCR_PULL_TOKEN` (`read:packages`) in `.env`, then `./deploy.sh`.

### Live (production)

| Surface | URL |
| ------- | --- |
| Web HMI | https://tele-pendant.jahbyte.com |
| API health | https://api.tele-pendant.jahbyte.com/api/v1/health |
| Swagger UI | https://api.tele-pendant.jahbyte.com/api |
| OTA manifest | https://api.tele-pendant.jahbyte.com/ota/manifest |
| Phone API base | https://api.tele-pendant.jahbyte.com/api/v1 |

`APP_URL=https://api.tele-pendant.jahbyte.com` · `FRONTEND_URL=https://tele-pendant.jahbyte.com`

### Local

- API health: http://localhost:3010/api/v1/health
- Swagger: http://localhost:3010/api
- Compodoc: `pnpm --filter @tele-pendant/api docs:serve`
- httpyac: `apps/api/src/**/http/*.endpoints.http`
- Web: http://localhost:5173 (host) or http://localhost:8080 (Docker `WEB_PORT`) — `/operator`, `/ops`, `/media`, `/admin`, `/assistant`, `/face`
- Expo: `pnpm --filter @tele-pendant/mobile dev` (set API base to LAN or the live API URL on the phone)
- Native mobile (handover): signed `.apk`, `.aab`, and `.ipa` are **not in git**; vendor sends installables and signing keys securely. Rebuild with `pnpm handover:mobile` (APK + AAB + iOS) or `handover:mobile:apk` / `:aab` / `:ios` (see [`docs/MOBILE_RELEASE.md`](./docs/MOBILE_RELEASE.md))
- Default admin: `admin@example.com` / `change-me-admin-password` (from `.env`); admins manage operator/supervisor accounts in Config **Users**; all roles change login password via the web **Account menu** or phone drawer
- Safe-action PIN (reset e-stop only, not login): `SAFE_ACTION_PIN`
- Seed QR: `TP-CRANE-DEMO-01`
- Face auth: local challenge liveness (not ISO-certified) — [`docs/FACE_LIMITATIONS.md`](./docs/FACE_LIMITATIONS.md)
- Assistant: **acceptance = local SQLite FTS** (Cursor Agent only if `CURSOR_API_KEY` is set)
- Drivers: [`docs/DRIVERS.md`](./docs/DRIVERS.md) · Scope checklist: [`docs/SCOPE_ACCEPTANCE.md`](./docs/SCOPE_ACCEPTANCE.md)
- OTA: [`docs/OTA.md`](./docs/OTA.md) (JS OTA; native modules need APK rebuild)

## Verify before deploy

```bash
pnpm verify
```

Runs format, lint, typecheck, test, and test:cov across the workspace.

Modbus TCP integration (sim + driver):

```bash
pnpm --filter @tele-pendant/modbus-core test:integration
```
