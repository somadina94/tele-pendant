# Tele-Pendant — Training outline

Live demo hosts: web https://tele-pendant.jahbyte.com · API/Swagger https://api.tele-pendant.jahbyte.com/api · health https://api.tele-pendant.jahbyte.com/api/v1/health.

## Session 1 (30–45 min)

1. Architecture: web/Expo → API → Modbus → sim/PLC
2. Login + roles (operator / supervisor / admin)
3. Operator matrix + deadman hold practice
4. Overlays and safety banner meanings
5. E-stop is one press; the reset PIN only clears it

## Session 2 (30 min)

1. Ops: alarms ack, trends, diagnostics
2. Media: QR seed code, voice allowlist
3. Assistant local search demos
4. Face challenge enroll/login limitations (local, not ISO; never for e-stop)

## Session 3 (30 min)

1. Admin: connections, register maps, cells, **Users** (add / suspend / remove)
2. **Account menu**: change login password vs plant **Reset PIN**
3. Switch from simulator to real PLC checklist
4. Docker deploy / OTA overview
5. Manual test plan dry-run

Hand out `USER_MANUAL.md`, `REAL_PLC_WIRING.md`, and `SCOPE_ACCEPTANCE.md`.

> **Safety:** Software deadman, e-stop latch, watchdog, and safe-state **supervise the HMI path only**. They are not a SIL/PL certified safety system. Wire hardwired safety per `REAL_PLC_WIRING.md`.

A live classroom session is a person in the room. This repository does not run that session. The outline above is the note the trainer follows (**outline delivered / live session by vendor**).

Cover language (`en`/`es`/`fr`/`de`), user-defined alarms, trend checkboxes, safety-role bindings, Modbus + OPC UA (`DRIVERS.md`), FTS assistant without Cursor key, and face challenge liveness (`FACE_LIMITATIONS.md`).
