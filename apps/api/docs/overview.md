# Tele-Pendant API Guides

## Overview

Industrial tele-pendant API: NxM cell matrix HMI, Modbus TCP driver, safety
supervision (deadman, watchdog, e-stop, safe-state), alarms, trends, and local
assistant search (SQLite FTS, no cloud LLM). Optional basic face enroll/login is
local challenge liveness (not ISO-certified) — see repo `docs/FACE_LIMITATIONS.md`. Operators use the web or
Expo client; configuration and Modbus maps live in SQLite.

## Live URLs

- Web HMI: `https://tele-pendant.jahbyte.com`
- API: `https://api.tele-pendant.jahbyte.com/api/v1`
- Health: `https://api.tele-pendant.jahbyte.com/api/v1/health`
- Swagger: `https://api.tele-pendant.jahbyte.com/api`
- OTA: `https://api.tele-pendant.jahbyte.com/ota/manifest`

`APP_URL=https://api.tele-pendant.jahbyte.com` · `FRONTEND_URL=https://tele-pendant.jahbyte.com`

## Local URLs

- API: `http://localhost:3010/api/v1`
- Health: `http://localhost:3010/api/v1/health`
- Swagger: `http://localhost:3010/api`
- Compodoc: `pnpm run docs:serve`
- httpyac health: `pnpm run http:health`

## Safety note

Deadman, e-stop supervision, watchdog, and safe-state are **software** contracts
over Modbus registers. They do not replace hardwired SIL / safety-PLC hardware.
