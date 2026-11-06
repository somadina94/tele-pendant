# Mobile signing package (local only, not in git)

Put **release signing files here** on your build machine. Everything under this folder except this README and `credentials.example.env` is **gitignored**.

## Layout

```
signing/
  README.md                 (tracked in git)
  credentials.example.env   (tracked template)
  credentials.env           (your secrets; gitignored)
  android/
    tele-pendant-release.keystore   (or .jks)
  ios/
    distribution.p12
    TelePendant.mobileprovision     (or similar)
```

Copy `credentials.example.env` to `credentials.env` and fill in passwords and team ID. Paths in `credentials.env` are relative to this `signing/` folder unless absolute.

Build scripts load `credentials.env` automatically when present (`load-mobile-signing.mjs`).

## Zip for secure handover

From repo root, after files are in place:

```bash
pnpm handover:mobile:signing-zip
```

Creates **`apps/mobile/dist/mobile-signing-handover.zip`** (also gitignored). Send that zip over a secure channel; do **not** commit it or push to git.

Recipient unpacks into `apps/mobile/signing/` on their machine, then runs `pnpm handover:mobile`.
