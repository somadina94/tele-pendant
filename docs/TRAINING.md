# Tele-Pendant — Training outline

Live demo hosts: web https://tele-pendant.jahbyte.com · API/Swagger https://api.tele-pendant.jahbyte.com/api · health https://api.tele-pendant.jahbyte.com/api/v1/health.

## Session 1 (30–45 min)

1. Architecture: web/Expo → API → Modbus → sim/PLC
2. Login + roles (operator / supervisor / admin)
3. Operator matrix + deadman hold practice
4. Overlays and safety banner meanings
5. E-stop / safe-action PIN (supervisor)

## Session 2 (30 min)

1. Ops: alarms ack, trends, diagnostics
2. Media: QR seed code, voice allowlist
3. Assistant local search demos
4. Face enroll limitations

## Session 3 (30 min)

1. Admin: connections, register maps, cells
2. Switch from simulator to real PLC checklist
3. Docker deploy / OTA overview
4. Manual test plan dry-run

Hand out `USER_MANUAL.md` and `REAL_PLC_WIRING.md`.

A live classroom session is a person in the room. This repository does not run that session. The outline above is the note the trainer follows.

Cover language (browser or phone until the operator pins one), user-defined alarms, trend checkboxes, safety-role bindings, and that OPC UA is the second driver beside Modbus. Face login detects a face and is not a certified biometric (`FACE_LIMITATIONS.md`).
