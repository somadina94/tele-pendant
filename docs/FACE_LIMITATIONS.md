# Face auth — limitations (basic only)

Tele-Pendant face enroll/login is a **convenience** feature, not biometric security.

## What it does

- Builds a coarse intensity histogram descriptor from a JPEG/PNG data URL.
- Stores the template on the user row (`face_template`).
- On login, compares cosine similarity against enrolled templates (optional email hint).

## What it does not do

- No liveness detection
- No certified biometric match / no PAD
- No anti-spoofing against photos or screens
- No template encryption beyond DB file permissions
- Not suitable as sole plant access control

## Policy

- Enroll only after password login.
- Fail closed: if match fails, use password.
- Prefer supervisor/admin password for e-stop / safe-action PIN flows.
- Document this limitation in operator training (`TRAINING.md`).
