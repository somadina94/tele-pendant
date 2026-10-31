# Tele-Pendant — Maintenance

## Verify before deploy

```bash
pnpm verify
pnpm --filter @tele-pendant/modbus-core test:integration
```

## SQLite

- Runtime DB: `DATABASE_PATH` / Docker volume `/app/data/tele-pendant.sqlite`
- Assistant FTS: `data/assistant-fts.sqlite`
- Backup: copy `data/` while API is stopped

## Reindex assistant docs

`POST /api/v1/assistant/reindex` (admin JWT) after updating `docs/*.md`.

## Logs / audit

`GET /api/v1/audit` (admin/supervisor). Export via SQL or future CSV endpoint.

## OTA

- **Web:** redeploy container / static assets (`docker compose ... up -d`).
- **Mobile:** host Expo Updates manifest at `updates.url`; rebuild native binary when native modules change.

## Modbus map changes

Edit register maps / cells in SQLite (admin UI lists them). Point `PlcConnection` at real PLC host when leaving the simulator.
