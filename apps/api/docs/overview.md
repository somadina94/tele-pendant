# Tele-Pendant API Guides

## Overview

Industrial tele-pendant API: NxM cell matrix HMI, Modbus TCP driver, safety
supervision (deadman, watchdog, e-stop, safe-state), alarms, trends, and local
assistant search (SQLite FTS, no cloud LLM). Optional basic face enroll/login is
local challenge liveness (not ISO-certified) — see repo `docs/FACE_LIMITATIONS.md`. Operators use the web or
Expo client; configuration and Modbus maps live in SQLite.

## Your hosts

Set these to the hostnames you control. The repository does not ship a public hostname.

- Web HMI: `https://YOUR_HMI_HOST`
- API: `https://YOUR_API_HOST/api/v1`
- Health: `https://YOUR_API_HOST/api/v1/health`
- OTA: `https://YOUR_API_HOST/ota/manifest`

`APP_URL=https://YOUR_API_HOST` · `FRONTEND_URL=https://YOUR_HMI_HOST`

## Local URLs

- API: `http://localhost:3010/api/v1`
- Health: `http://localhost:3010/api/v1/health`
- Swagger: `http://localhost:3010/api`
- Compodoc: `pnpm run docs:serve`
- httpyac health: `pnpm run http:health`

## Safety note

Deadman, e-stop supervision, watchdog, and safe-state are **software** contracts
over Modbus registers. They do not replace hardwired SIL / safety-PLC hardware.
