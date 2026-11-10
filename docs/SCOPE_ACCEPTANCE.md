# Scope acceptance (JD delivery checklist)

Evidence map for tomorrow’s review. Tick each row with the linked screen, API, or doc. Items marked **out of software scope** are honest exclusions.

| JD theme | Evidence | Status |
| -------- | -------- | ------ |
| Milestone-1 soft pendant (P03A21) | Operator grid matches photo layout; rocker selectors write 2 coils; illuminated PB + lamp DO; Enable gate for jog; admin `POST /hmi/demo/p03a21/reset`; map in `pendant-p03a21-map.ts` | Software delivered (demo Modbus coils; not exact Siemens PLC addresses) |
| Operator cell triad (command + feedback + status) | Web `/operator` matrix cells; Expo Operator screen; seed in `hmi-seed.service.ts` | Software delivered |
| Local face auth with challenge liveness | `/face`, Expo Face; `face.util.ts` challenge + AES via `FACE_TEMPLATE_KEY`; `FACE_LIMITATIONS.md` | Software delivered (not ISO-certified) |
| Auth / face rate limits + hardening | `@Throttle` on login + face; Helmet/JWT/roles; Security sections in manuals | Software delivered |
| Safety supervision honesty | USER_MANUAL + TRAINING banners; `REAL_PLC_WIRING.md` | Software supervision only; **not SIL/PL certified** |
| Drivers | `DRIVERS.md`; Modbus TCP + OPC UA via `PlcPort` | Software delivered; no new fieldbuses |
| OTA | `OTA.md`; JS/asset OTA; native camera/speech need APK rebuild | Software delivered (honest native limit) |
| Assistant | Local FTS default; Cursor only if `CURSOR_API_KEY` set | **Acceptance = FTS without Cursor key** |
| i18n | `en` / `es` / `fr` / `de` in `packages/shared/i18n`; language pickers | Software delivered |
| User accounts | Config **Users** (admin); suspend/edit/remove; **Change password** (all roles); migration `AddUserSuspended` | Software delivered |
| Manuals / test plan | USER_MANUAL, MANUAL_TEST_PLAN, INSTALLATION, TRAINING outline | Software delivered |
| Live classroom training | `TRAINING.md` outline only | **Vendor-led live session**: not automated in repo |
| Certified biometrics / PAD lab | n/a | **Out of scope** |
| SIL/PL certified safety hardware | n/a | **Out of scope** |
| Full SIEM/SOC | Audit log only | **Out of scope** |

## Quick verify

```bash
# After pnpm install in Terminal.app (Cursor may block .vscode extract)
pnpm verify
```

Manual smoke: Admin reset P03A21 → Operator labels match photo grid → rocker writes two coils → Enable required for jog → illuminated PB lamp → Face 3-step enroll/login → Assistant ask with **no** `CURSOR_API_KEY` → language picker fr/de → Admin protocol toggle matches `DRIVERS.md`.
