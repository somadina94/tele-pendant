# Expo Updates OTA signing keys (private)

Put the **private** Expo Updates code-signing key here as `private-key.pem` (gitignored).

Generate once (from `apps/mobile`):

```bash
npx expo-updates codesigning:generate \
  --key-output-directory signing/ota \
  --certificate-output-directory certs \
  --certificate-validity-duration-years 10 \
  --certificate-common-name "Tele-Pendant"
```

- Commit **`apps/mobile/certs/certificate.pem`** (public).
- Keep **`private-key.pem`** out of git; copy to `apps/api/ota/private-key.pem` on the API host, or set `OTA_CODE_SIGNING_PRIVATE_KEY` / `OTA_CODE_SIGNING_PRIVATE_KEY_PATH`.

See [docs/OTA.md](../../../../docs/OTA.md) and [docs/MOBILE_RELEASE.md](../../../../docs/MOBILE_RELEASE.md) (TP-43).
