# Tele-Pendant documentation

## Live deployment

| Surface | URL |
| ------- | --- |
| Web HMI | https://hmi.example.com |
| API health | https://api.example.com/api/v1/health |
| Swagger UI | https://api.example.com/api |
| OTA manifest | https://api.example.com/ota/manifest |
| Phone API base | https://api.example.com/api/v1 |

Server `.env` public origins:

```env
APP_URL=https://api.example.com
FRONTEND_URL=https://hmi.example.com
COOKIE_SECURE=true
```

## Manuals

- [PLAIN_LANGUAGE_GUIDE.md](./PLAIN_LANGUAGE_GUIDE.md); features, buzzwords, controls, and Config for non-technical readers
- [USER_MANUAL.md](./USER_MANUAL.md)
- [INSTALLATION.md](./INSTALLATION.md)
- [MAINTENANCE.md](./MAINTENANCE.md)
- [REAL_PLC_WIRING.md](./REAL_PLC_WIRING.md)
- [MANUAL_TEST_PLAN.md](./MANUAL_TEST_PLAN.md)
- [TRAINING.md](./TRAINING.md)
- [FACE_LIMITATIONS.md](./FACE_LIMITATIONS.md)
- [OTA.md](./OTA.md)
- [MOBILE_RELEASE.md](./MOBILE_RELEASE.md); handover native Android/iOS builds (signing keys not in repo)

Modbus TCP is the default driver. OPC UA is optional (`docker compose --profile opcua`). Languages are `packages/shared/i18n/en.json` and `es.json`. Add another language by dropping in a JSON file.

API Compodoc guides: `apps/api/docs/`.
