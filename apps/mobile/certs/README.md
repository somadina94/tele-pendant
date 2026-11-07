# Expo Updates code-signing certificate (public)

`certificate.pem` is embedded in release builds so the app can verify OTA manifests (TP-43).

Do **not** put the private key here. Private key lives under `apps/mobile/signing/ota/` (gitignored) or on the API host.
