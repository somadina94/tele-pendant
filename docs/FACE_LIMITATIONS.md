# Face auth — limitations (local, not certified)

Tele-Pendant face enroll/login is a **convenience** feature. It runs on the API. The web app and the phone only send a snapshot.

## What it does

- Decodes a JPEG or PNG on the server.
- Uses the vendored skin-gate model in `apps/api/assets/face-models/skin-gate.json`. No network call and no account.
- Rejects the frame when it does not contain exactly one face-like region.
- Stores an 8×8 luminance embedding on `users.face_template`.
- Matches by Euclidean distance. A weak match fails closed to the password.

## What it does not do

- No liveness detection
- No presentation-attack detection
- No certified biometric match
- No template encryption beyond database file permissions
- Not suitable as the only plant access control

## Policy

- Enroll only after password login.
- If the match fails, or the picture has no single face, use the password.
- Prefer the supervisor password for e-stop and safe-action PIN flows.
- A classroom training session is still a person, outside this repository. See `TRAINING.md`.
