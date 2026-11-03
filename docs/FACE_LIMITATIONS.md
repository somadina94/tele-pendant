# Face auth — limitations (local, not certified)

Tele-Pendant face enroll/login is **local on-prem production biometrics**, not an ISO/IEC-certified product. Web and phone send challenge frames; matching runs only on your API.

## What it does

- Guided **3-frame challenge** (center → turn left → turn right).
- Decodes JPEG/PNG on the server; vendored skin-gate in `apps/api/assets/face-models/skin-gate.json` (no cloud).
- Rejects frames that do not contain exactly one face-like region.
- Requires **inter-frame motion** between challenge poses (basic liveness / anti-still-photo).
- Builds a stronger multi-band spatial embedding and stores it on `users.face_template`.
- When `FACE_TEMPLATE_KEY` is set, templates are sealed with **AES-256-GCM** at rest.
- Match fails closed to password. Face login and enroll are rate-limited with other auth routes.
- Audits enroll, successful match, failed match, and spoof/liveness failures (`auth.face_spoof`).

## What it does not do

- Not ISO/IEC certified biometrics
- Not a lab PAD report or certified presentation-attack detection product
- Not a SIEM/SOC product
- **Never** authorizes e-stop, SAFE_ACTION_PIN, or other safety actions — password/PIN remain the hard path
- Not suitable as the only plant access control

## Policy

- Enroll only after password login.
- Prefer the 3-step challenge; single-frame is legacy fallback for tests only.
- If match or liveness fails, use the password.
- Prefer supervisor password/PIN for e-stop and safe-action flows.
- Set a strong `FACE_TEMPLATE_KEY` (32+ chars) in production `.env`.
- A classroom training session is still a person, outside this repository. See `TRAINING.md`.
