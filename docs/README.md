# Tele-Pendant documentation

## Live deployment

| Surface | URL |
| ------- | --- |
| Web HMI | https://tele-pendant.jahbyte.com |
| API health | https://api.tele-pendant.jahbyte.com/api/v1/health |
| Swagger UI | https://api.tele-pendant.jahbyte.com/api |
| OTA manifest | https://api.tele-pendant.jahbyte.com/ota/manifest |
| Phone API base | https://api.tele-pendant.jahbyte.com/api/v1 |

Server `.env` public origins:

```env
APP_URL=https://api.tele-pendant.jahbyte.com
FRONTEND_URL=https://tele-pendant.jahbyte.com
COOKIE_SECURE=true
```

## Manuals

- [USER_MANUAL.md](./USER_MANUAL.md)
- [INSTALLATION.md](./INSTALLATION.md)
- [MAINTENANCE.md](./MAINTENANCE.md)
- [REAL_PLC_WIRING.md](./REAL_PLC_WIRING.md)
- [MANUAL_TEST_PLAN.md](./MANUAL_TEST_PLAN.md)
- [TRAINING.md](./TRAINING.md)
- [FACE_LIMITATIONS.md](./FACE_LIMITATIONS.md)
- [OTA.md](./OTA.md)

Modbus TCP is the default driver. OPC UA is optional (`docker compose --profile opcua`). Languages are `packages/shared/i18n/en.json` and `es.json`. Add another language by dropping in a JSON file.

API Compodoc guides: `apps/api/docs/`.
