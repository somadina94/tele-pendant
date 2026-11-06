# Tele-Pendant: Maintenance

## Live checks

| Check | URL |
| ----- | --- |
| Web | https://hmi.example.com |
| Health | https://api.example.com/api/v1/health |
| Swagger | https://api.example.com/api |
| OTA | https://api.example.com/ota/manifest |

`APP_URL=https://api.example.com` · `FRONTEND_URL=https://hmi.example.com`

## Verify before deploy

```bash
pnpm verify
pnpm --filter @tele-pendant/modbus-core test:integration
```

## SQLite

- Runtime DB: `DATABASE_PATH` / Docker volume `/app/data/tele-pendant.sqlite`
- Assistant FTS: `data/assistant-fts.sqlite`
- Backup: copy `data/` while API is stopped
- Schema upgrades: `pnpm --filter @tele-pendant/api build && pnpm --filter @tele-pendant/api migration:run` (see `INSTALLATION.md`). Check pending migrations with `migration:show`.

## Reindex assistant docs

`POST /api/v1/assistant/reindex` (admin JWT) after updating `docs/*.md`.

## Logs / audit

`GET /api/v1/audit` (admin/supervisor). Export via SQL or future CSV endpoint.

## OTA

- **Web:** redeploy container / static assets (`docker compose ... up -d`). Live site: https://hmi.example.com
- **Mobile:** `OTA_PUBLIC_URL=https://api.example.com pnpm --filter @tele-pendant/mobile ota:export` writes the manifest into `apps/api/ota`. Live check: https://api.example.com/ota/manifest. Rebuild the binary when camera or speech changes.

## Modbus map changes

Edit register maps / cells in SQLite (admin UI lists them). Point `PlcConnection` at real PLC host when leaving the simulator.
