# From zero

Build the API, the web HMI, and the Expo app with your own keys and URLs. Nothing in this repo points at a vendor host. A build fails when the public URL is missing.

## 1. API and web

```bash
git clone <your-repo> tele-pendant && cd tele-pendant
cp .env.example .env
cp apps/api/.env.example apps/api/.env
```

Set these in `.env` and `apps/api/.env` to your values:

```env
APP_URL=https://YOUR_API_HOST
FRONTEND_URL=https://YOUR_HMI_HOST
COOKIE_SECURE=true
DATABASE_SYNC=false
FACE_LOGIN_ENABLED=false
JWT_SECRET=<your secret, at least 32 characters>
JWT_TOKEN_AUDIENCE=tele-pendant
JWT_TOKEN_ISSUER=tele-pendant-api
JWT_ACCESS_TOKEN_TTL=3600
JWT_REFRESH_TOKEN_TTL=86400
ADMIN_EMAIL=<your admin email>
ADMIN_PASSWORD=<your admin password>
SAFE_ACTION_PIN=<your reset PIN>
FACE_TEMPLATE_KEY=<your key, at least 32 characters>
```

`DATABASE_SYNC` stays false. The API creates the schema from `apps/api/src/database/migrations/` when it starts. A later restart does not wipe cells you changed.

Leave `FACE_LOGIN_ENABLED` false unless you want face enroll and face login. The web button stays hidden unless you also set `VITE_FACE_LOGIN=true` for the web build. The phone button stays hidden unless you set `EXPO_PUBLIC_FACE_LOGIN=true`.

```bash
pnpm install
pnpm --filter @tele-pendant/shared build
pnpm --filter @tele-pendant/modbus-core build
pnpm --filter @tele-pendant/plc-driver build
pnpm --filter @tele-pendant/modbus-sim dev
pnpm --filter @tele-pendant/api start:dev
pnpm --filter @tele-pendant/web dev
```

Open `http://localhost:5173`. Health is `http://localhost:3010/api/v1/health`. Sign in with `ADMIN_EMAIL` and `ADMIN_PASSWORD`.

## 2. Expo

```bash
cp apps/mobile/.env.example apps/mobile/.env
```

Set your API, not a placeholder you do not own:

```env
EXPO_PUBLIC_API_URL=https://YOUR_API_HOST/api/v1
OTA_PUBLIC_URL=https://YOUR_API_HOST
EXPO_PUBLIC_FACE_LOGIN=false
```

A phone on the same Wi-Fi as a local API can use `MOBILE_API_URL=http://YOUR_LAN_IP:3010/api/v1` in the root `.env` instead. `127.0.0.1` on the phone is the phone itself.

```bash
pnpm --filter @tele-pendant/mobile dev
```

`apps/mobile/app.config.js` refuses to build when `EXPO_PUBLIC_API_URL` / `APP_URL` or `OTA_PUBLIC_URL` is unset. The OTA private key stays on the machine that signs updates (`OTA_CODE_SIGNING_PRIVATE_KEY` or a `*.pem` file that is not copied into the image). Do not commit that key.

## 3. Production

Push to `main` runs verify and publishes the API, simulator, and web images. It does not deploy the server. Deploy by running the CI workflow by hand on `main`, or on the server:

```bash
./deploy.sh
```

That copies `data/tele-pendant.sqlite` and the current image ids into `./backups` before it replaces the stack. It does not delete Docker images. If the new API does not become healthy, the script restores that backup. You can restore it yourself with:

```bash
./deploy.sh rollback
```

Put your hostnames in `APP_URL` and `FRONTEND_URL` on the server `.env`, with `COOKIE_SECURE=true` when those URLs are `https`.
