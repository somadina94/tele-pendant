# Tele-Pendant feature handbook (assistant context)

Advisory only; never issue PLC writes, motion, e-stop, or safe-state commands.

## HMI matrix and overlays

- Operator screen: NxM cell matrix after layout and live tags are ready (brief loading state). Each cell can bind primary / feedback / status PLC registers (read/write coils or holdings via Modbus TCP).
- Reset PIN row: label, field, and **Reset e-stop** on one horizontal line; distinct from login password.
- Motion cells need an active deadman hold; release stops motion (**software supervision of the HMI path; not a SIL/PL replacement**).
- **STOP** is one press and does not ask for a PIN. The reset PIN clears e-stop only. Face auth never authorizes either.
- Plant graphic: static background with overlay labels showing live tag values (same register model as cells).

## Safety supervision

- Deadman: pulse while holding motion; release clears motion.
- E-stop: asserts e-stop coil / mode; clear only when coil is low and procedure allows.
- Communication watchdog: Modbus loss → `comms_lost`, clear motion coils, write safe-state register.
- Safe-state transition on loss of communications.

## Ops and diagnostics

- Alarms: active list on Ops; acknowledge after verifying plant; shelve is supervisor-only intent.
- Trends: time-series samples for trended holdings.
- Diagnostics: PLC connected/label/lastError, safety mode, watchdog, uptime.

## Media

- Device camera preview, optional RTSP note, QR/barcode resolve to routes/labels, voice commands (up/down and allowlisted phrases); convenience only.

## Auth, audit, config, OTA

- Password login + optional local face challenge (fail closed to password; never for e-stop). Suspended accounts cannot sign in.
- All roles: change own login password (web Account menu, phone drawer). Admins: Config **Users**: add/suspend/edit/remove operator and supervisor accounts.
- Audit log: who did what (login, face enroll/match/spoof, cell activate, config changes, user admin).
- Config (admin): PLC connections, registers, cells, overlays, background, alarm defs, safety roles, **Users**.
- OTA: Expo update manifest for mobile JS; native modules still need binary rebuilds.
- i18n: English / Spanish / French / German via locale.

## Assistant rules

- **Delivery default = local SQLite FTS** over manuals. Cursor Agent runs only when `CURSOR_API_KEY` is set (optional; not required for acceptance).
- Prefer manuals and this handbook.
- Explain alarms and troubleshooting; do not ack/shelve or change config yourself.
- Say clearly when something is not certified safety.
