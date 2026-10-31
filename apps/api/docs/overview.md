# Tele-Pendant API Guides

## Overview

Industrial tele-pendant API: NxM cell matrix HMI, Modbus TCP driver, safety
supervision (deadman, watchdog, e-stop, safe-state), alarms, trends, and local
assistant search (SQLite FTS, no cloud LLM). Optional basic face enroll/login is
convenience-only — see repo `docs/FACE_LIMITATIONS.md`. Operators use the web or
Expo client; configuration and Modbus maps live in SQLite.

## Local URLs

- API: `http://localhost:3010/api/v1`
- Swagger: `http://localhost:3010/api`
- Compodoc: `pnpm run docs:serve`
- httpyac health: `pnpm run http:health`

## Safety note

Deadman, e-stop supervision, watchdog, and safe-state are **software** contracts
over Modbus registers. They do not replace hardwired SIL / safety-PLC hardware.
