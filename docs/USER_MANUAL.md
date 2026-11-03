# Tele-Pendant — click-through test manual

Use this on the **live** site or while the Docker **dev** stack is running. Every feature below is a click on the web UI, plus the Expo handheld at the end. Do the steps in order. **STOP is last** because it latches until the simulator is restarted.

## Live deployment

| Check   | Where                                                      | Success              |
| ------- | ---------------------------------------------------------- | -------------------- |
| Web     | https://tele-pendant.jahbyte.com                           | Tele-Pendant loads   |
| API     | https://api.tele-pendant.jahbyte.com/api/v1/health         | JSON `status` is `ok` |
| Swagger | https://api.tele-pendant.jahbyte.com/api                   | Swagger UI loads     |
| OTA     | https://api.tele-pendant.jahbyte.com/ota/manifest          | JSON `runtimeVersion` |
| Phone   | API base `https://api.tele-pendant.jahbyte.com/api/v1`     | Sign-in works        |

`APP_URL=https://api.tele-pendant.jahbyte.com` · `FRONTEND_URL=https://tele-pendant.jahbyte.com`

On live, open https://tele-pendant.jahbyte.com/operator after sign-in. The click paths below use local Docker URLs; the same menus and routes apply on the live host (replace `http://localhost:8080` with `https://tele-pendant.jahbyte.com`).

## What is already running (local Docker)

| Check     | Where                               | Success                                                                            |
| --------- | ----------------------------------- | ---------------------------------------------------------------------------------- |
| API       | http://localhost:3010/api/v1/health | JSON `status` is `ok`                                                              |
| Swagger   | http://localhost:3010/api           | Swagger UI loads                                                                   |
| Web       | http://localhost:8080               | Tele-Pendant page (port comes from `WEB_PORT` in `.env`; this stack uses **8080**) |
| Simulator | host port **1502**                  | Container `tele-pendant-modbus-sim-dev` is up                                      |

You are already signed in. The operator screen is http://localhost:8080/operator (live: https://tele-pendant.jahbyte.com/operator).

Sign-in values if you get logged out (from `.env`):

- Email: `ADMIN_EMAIL` (seed `admin@example.com`)
- Password: `ADMIN_PASSWORD` (seed `change-me-admin-password`)
- Safe-action PIN: `SAFE_ACTION_PIN` (seed is the same string as the admin password)

## 0. Sign in (only if you see the login page)

1. Open http://localhost:8080.
2. **Success:** heading **Tele-Pendant**, text **Sign in to operate the demo crane**, fields **Email** and **Password** already filled, button **Sign in**, link **Face login (basic)**.
3. Click **Sign in**.
4. **Success:** the address becomes `/operator`. You see **Demo crane operator HMI** and the top links **Media**, **Assistant**, **Face**, **Ops**, **Config**, **Audit**, **Logout**.

Wrong password shows a red error and you stay on the login page.

## 1. Operator screen — layout

Stay on http://localhost:8080/operator.

**Success, top to bottom:**

- Banner starts with **Safety: normal**. It does not say `deadman HOLD` or `E-STOP`.
- Left panel title **demo-crane**.
- Three overlays on the graphic: **Height** (about `1250 mm` at a fresh simulator), **Load** (`0 kg`), **Motor** (`IDLE`).
- Strip under the graphic: `H … mm`, `Load … kg`, and `IDLE`.
- Right panel title **Control matrix**.
- Field labeled **SAFE_ACTION_PIN**. The hint under it shows the demo value `change-me-admin-password` (same as the admin password). Type that value, not the words SAFE_ACTION_PIN.
- Five buttons in a 3×3 grid (corners are empty):

  |        | left          | center         | right         |
  | ------ | ------------- | -------------- | ------------- |
  | top    | empty         | **Hoist Up**   | empty         |
  | middle | **Trolley L** | **STOP**       | **Trolley R** |
  | bottom | empty         | **Hoist Down** | empty         |

- Hint under the grid: **Hold motion buttons: deadman pulses while pressed. Release to stop.**
- **Hoist Up** and **Hoist Down** show the latest feedback and status under the label (motor **RUN** or **IDLE**, and the height number) when those addresses are set.

Numbers on Height and the `H` strip should match and tick together (live tags over the socket).

## 2. Deadman + hoist up

1. Press and **hold** **Hoist Up** for about 2 seconds. Do not type a PIN.
2. **While held, success:**
   - Banner includes **deadman HOLD**.
   - **Height** and `H … mm` climb (simulator adds 25 mm about every 0.2 s, cap 5000).
   - **Motor** overlay and the strip change from `IDLE` to `RUN`.
   - No red error.
3. Release the button.
4. **Success:** **deadman HOLD** disappears. Motor returns to `IDLE`. Height stays at the new value (it does not snap back).

## 3. Hoist down

1. Press and hold **Hoist Down** for about 2 seconds, then release.
2. **Success:** same deadman and `RUN` behavior. Height decreases (floor 0 mm). After release, motor is `IDLE` and height stays put.

## 4. Trolley left and right

1. Press and hold **Trolley L**, then release.
2. Press and hold **Trolley R**, then release.
3. **Success:** banner shows **deadman HOLD** only while the button is down, then clears. No red error. Height does not have to change — the demo graphic has no trolley position overlay. Motor stays `IDLE` for trolley moves (the simulator sets `RUN` only for hoist up/down).

## 5. STOP without a PIN (must fail)

1. Leave **Safe-action PIN** empty.
2. Click **STOP**.
3. **Success:** a red error that includes **SAFE_ACTION_PIN does not match**. Banner stays **Safety: normal**. No **E-STOP** on the banner.

## 6. Media — camera, codes, voice

Click **Media** in the top nav (or open http://localhost:8080/media).

**Success, page chrome:**

- Heading **Camera · QR · Voice**.
- Links **Operator** and **Ops**.
- Note: **Browser/device camera for demo. Set CAMERA_RTSP_URL for plant CCTV later.**
- Section **Device camera** with button **Scan QR / barcode in frame**.
- Section **Manual / known codes**.
- Code field already contains `TP-CRANE-DEMO-01`, button **Resolve**.
- Two code buttons:
  - **TP-CRANE-DEMO-01** — Demo crane bay A
  - **TP-OPS** — Ops dashboard
- Section **Voice commands**. Hint: **Say UP or DOWN**. Trolley is left or right. Or say stop.
- Button **Listen (8s)**.

### 6a. Resolve the crane code

1. Click **Resolve** (field still `TP-CRANE-DEMO-01`).
2. **Success:** the app navigates to **/operator**. That code’s route is the operator screen.

Go back with the browser Back button, or open http://localhost:8080/media again.

### 6b. Ops shortcut code

1. Click the **TP-OPS** button (not the field).
2. **Success:** the app navigates to **/ops** (Alarms · Trends · Diagnostics).

Return to **Media** via the address bar http://localhost:8080/media (the ops page only links back to Operator).

### 6c. Unknown code

1. Replace the code field with `NOT-A-CODE`.
2. Click **Resolve**.
3. **Success:** you stay on Media and see an error that includes **Unknown code**.

Put `TP-CRANE-DEMO-01` back in the field if you want.

### 6d. Scan button

1. Click **Scan QR / barcode in frame**.
2. **Success in this desktop browser (no QR in front of the camera):** either **No code in frame**, or **BarcodeDetector not supported — use manual code or Chrome**. A red camera message (**Camera permission denied** or a browser permission string) is success for a blocked camera; allow the camera and the video panel appears instead.

### 6e. Voice

Hoist commands are the **UP** and **DOWN** buttons under Voice commands. Each runs the hoist for about 2 seconds. Saying those words does the same thing. The status line keeps what was heard.

1. Click **UP**.
2. **Success:** **Heard: up. Executed: Hoist Up**. On **Operator**, height climbs for about 2 seconds, then stops.
3. Click **DOWN**.
4. **Success:** **Heard: down. Executed: Hoist Down**, and height falls for about 2 seconds.
5. Optional: click **Listen (8s)** and say **up** or **down**. **Success** is the same status line as the buttons.
6. Repeat and say a nonsense phrase.
7. **Success:** **Heard: … Not executed: command_not_allowlisted**.
8. **stop** is allowlisted, but this page does not send the supervisor PIN, so **stop** must not show **Executed**. Use the operator **STOP** button in step 11 for the real e-stop test.

If the browser has no speech API, **success** is the line **SpeechRecognition not supported in this browser**.

## 7. Ops — diagnostics, trends, alarms

Open http://localhost:8080/ops (or, from Media, click the **TP-OPS** code).

**Success after a couple of seconds (the page polls):**

- Heading **Alarms · Trends · Diagnostics**, link **Operator**.
- **Diagnostics**
  - **PLC connected: true (demo-simulator)**
  - **Safety mode: normal**
  - **Watchdog OK: true**
  - **Uptime:** a number of seconds, increasing
- **Alarms:** **No active alarms** (until you press STOP in step 11).
- **Trend: hoist height (recent):** time-stamped lines ending in **mm**. After steps 2–3 and voice hoist, the mm values are not stuck only at the original 1250 if you held hoist long enough to move it. A line **No samples yet** means the poller has not written a sample yet — wait a few seconds and the list should fill.

When an alarm is **active**, **Ack** and **Shelve** sit on that row. **Ack** changes the state to **acked**. **Shelve** changes the state to **shelved**. Use one or the other on a given alarm. Step 11 clicks **Ack**. A later step clicks **Shelve** on a fresh STOP.

## 8. Config

From Operator, click **Config** (http://localhost:8080/admin). Sign in as the admin user. An operator account can open the page, and **Save** returns an authorization error.

**Success:**

- Heading **HMI config**, link **Operator**.
- Text says the fields are saved in SQLite and that **Use this PLC** plus **Save** connects.
- **PLC connections** shows the **demo-simulator** row: host `modbus-sim`, port `1502`, marked **(simulator)**, **Use this PLC** checked.
- **Register maps** includes at least these names, with the address field showing the demo number:
  - `coil.hoistUp` · coil · address `0`
  - `coil.hoistDown` · coil · address `1`
  - `coil.trolleyLeft` · coil · address `2`
  - `coil.trolleyRight` · coil · address `3`
  - `coil.eStop` · coil · address `11`
  - `holding.hoistHeightMm` · holding · address `0`
  - `holding.loadKg` · holding · address `1`
  - `discrete.motorRunning` · discrete · address `0`
  - Also `coil.deadman`, `holding.heartbeat`, and `holding.safeState` (used by the safety checks).
- Each register row has an **Address** field and a **Save** button. **Save** stores that Modbus number. Buttons and safety checks use the saved number.
- **Add a PLC** is an empty form (port `502`, unit id `1`, **Use this PLC** checked). Fill **Label** and **Host**, then **Add PLC**. **Success:** **Saved and connecting.** Ops then shows that label when the socket opens. If the host is unreachable, the red text includes **the PLC did not connect**. The row is still saved.
- To go back to the fake crane, check **Use this PLC** on **demo-simulator** and click **Save**. **Success:** **Saved and connecting.**
- **Cells (3 PLC addresses each):**
  - `[0,1] Hoist Up` — primary `coil.hoistUp` / feedback `discrete.motorRunning` / status `holding.hoistHeightMm`
  - `[1,0] Trolley L` — primary `coil.trolleyLeft`
  - `[1,1] STOP` — primary `coil.eStop`
  - `[1,2] Trolley R` — primary `coil.trolleyRight`
  - `[2,1] Hoist Down` — primary `coil.hoistDown` / feedback `discrete.motorRunning` / status `holding.hoistHeightMm`
- **Add a cell** is an empty form. Pick a primary register, fill the label, and click **Add cell**.
- **Live labels** lists **Height**, **Load**, and **Motor** with **X**, **Y**, **Format**, and a register. **Add a label** posts a new one.
- **Background** has **Name**, a CSS background, and an image URL. If the image URL is filled, Operator uses that picture. If it is empty, Operator uses the CSS background.

### Edit a cell, a label, and the background, then put them back

1. On **Hoist Up**, change **Cell label** to `Lift`. The button stays **Save Hoist Up** (it uses the saved name). Click it.
2. **Success:** **Saved Lift.** Open **Operator**. The button now says **Lift**.
3. Back on Config, set that label to `Hoist Up` and click **Save Lift**. **Success:** Operator shows **Hoist Up** again.
4. On the **Height** label, set **X** to `40` and **Y** to `50`. Click **Save Height**.
5. **Success:** **Saved Height.** On Operator the **Height** label has moved. Set **X** back to `18` and **Y** back to `22`, click **Save Height**, and it sits where it started.
6. On **Background**, replace the CSS with `red`. Leave the image URL empty. Click **Save background**.
7. **Success:** **Saved background.** Operator’s graphic is red. Put this CSS back and save again:

```
linear-gradient(160deg, #1a2332 0%, #0f1419 45%, #1e2a1e 100%)
```

**Success:** the graphic is the dark demo gradient again.

## 8a. Audit

From Operator, click **Audit** (http://localhost:8080/audit).

**Success:** heading **Audit**, link **Operator**, and a list of rows. Each row shows email, action, resource, result, and time. After the Config saves above, you see a `register.update` or `cell.update` row. An operator account can open the page and sees the authorization error from the API.

## 9. Assistant

From Operator, open **Assistant** (http://localhost:8080/assistant).

**Success, before you ask:**

- Heading **Assistant**.
- **Docs settings**: **Docs root path** (default `docs`), **Docs link (URL)**, **Save settings**, **Reindex**. Indexed count is shown.
- Optional **Open docs** when a docs link is saved (admin).
- **Question** prefilled with **What happens on lost Modbus?** and button **Ask**.

**Acceptance default:** leave `CURSOR_API_KEY` unset. Answers use local SQLite FTS over manuals. Optional Cursor Agent: set `CURSOR_API_KEY` in the API `.env` (never commit the key). Optional `CURSOR_AGENT_CWD` (repo root) and `CURSOR_MODEL` (default `auto`).

1. Click **Ask**.
2. **Success (FTS — required for acceptance):** bullet lines including **Lost communications** / `comms_lost`. Note mentions FTS or that `CURSOR_API_KEY` is unset.
3. **Success (with Cursor key — optional):** a short prose answer; note says Cursor Agent. The assistant is **advisory only** — it must not issue PLC or safety commands.

Admin: change **Docs root path**, save (reindexes when the path changes), or click **Reindex**. Set **Docs link** to a public manual URL for **Open docs**.

Optional: ask **deadman** — expect deadman hold guidance. Nonsense tokens → **No local documents matched…**

## 10. Face (local challenge)

From Operator, click **Face** (http://localhost:8080/face). You must already be signed in before enroll.

**Success, page chrome:**

- Heading **Face auth (local)**.
- Link **Password login**.
- Text about local challenge liveness, not ISO-certified, fail closed to password, never for e-stop.
- Field **Email hint (login)** = `admin@example.com`.
- Buttons for **3-step challenge** enroll and login.
- A live camera preview, or a short error if the browser blocked the camera.

1. Allow the camera if prompted.
2. Click enroll and follow prompts: center → turn left → turn right.
3. **Success:** status line mentions local on-prem face match / not ISO-certified / face never authorizes safety actions.
4. Log out (Operator **Logout** or password login page), then open `/face` again.
5. Leave **Email hint (login)** as `admin@example.com`. Run **Face login** with the same 3-step challenge.
6. **Success:** you land on **/operator**. Mismatch or failed liveness → **Face match failed — use password login** (or a liveness error). Prefer password when unsure.

Click **Enroll** while logged out. **Success:** **Sign in with password first, then enroll**.

## 11. STOP with PIN (do this last)

1. On http://localhost:8080/operator, click the **SAFE_ACTION_PIN** field.
2. Type `change-me-admin-password`. That is the value of `SAFE_ACTION_PIN` in `.env`, and it is the same as the admin password. Do not type the name `SAFE_ACTION_PIN`.
3. Click **STOP**.
4. **Success:**
   - Banner becomes **Safety: e_stop** and includes **E-STOP**.
   - Red safe-action error is gone.
5. Open **Ops**.
6. **Success:**
   - **Safety mode: e_stop**
   - **Alarms** shows **[critical] E-Stop asserted — active**
   - **Ack** and **Shelve** sit on that row
7. Click **Ack** (leave **Shelve** for the later fresh STOP).
8. **Success:** that row’s state changes from **active** to **acked**. **Ack** and **Shelve** disappear. The banner on Operator stays **e_stop** (ack does not clear the coil).
9. Back on Operator, hold **Hoist Up**.
10. **Success:** motion is rejected. Red text includes **Motion blocked: hold deadman and ensure normal safety mode**. Height does not climb.

### Clear e-stop so you can move again

There is no reset button on the HMI. The simulator latches the e-stop coil.

```bash
docker restart tele-pendant-modbus-sim-dev
```

Wait a few seconds. The API opens a new Modbus connection on its own. **Success:** Operator banner returns to **Safety: normal**, Ops **PLC connected: true**, and holding **Hoist Up** moves height again. You may see **comms_lost** for a moment while the simulator restarts. **E-STOP** on that same banner means the API still has the old socket; refresh the operator page after the banner changes.

### Shelve a fresh STOP

Do this only after the banner is **normal** again. One alarm cannot be both acked and shelved.

1. Type `change-me-admin-password` in **SAFE_ACTION_PIN** and click **STOP**.
2. Open **Ops** while the alarm is still **active**. **Shelve** is beside **Ack**.
3. Click **Shelve**. Do not click **Ack**.
4. **Success:** the state text is **shelved**.

Clear the coil again with `docker restart tele-pendant-modbus-sim-dev` if you still need hoist motion.

## 12. Logout

1. On Operator, click **Logout**.
2. **Success:** you are on `/` (the sign-in form). Opening http://localhost:8080/operator sends you back to sign-in.
3. Sign in again with **Sign in** if you want to keep testing.

## 13. OTA folder

The API serves `apps/api/ota` with no login.

1. Open https://api.tele-pendant.jahbyte.com/ota/manifest (local: http://localhost:3010/ota/manifest).
2. **Success:** JSON with `runtimeVersion` `0.0.1`, and the header `expo-protocol-version: 1`.
3. Point the phone `updates.url` at `https://api.tele-pendant.jahbyte.com/ota/manifest` for production builds. Replacing `manifest.json` and `assets/bundle.js` in that folder is the JavaScript update. The camera is a native module, so it still needs a binary rebuild.

## 14. Expo handheld

Header buttons: **Operator**, **Media**, **Face**, **Ops**, **Config**, **Audit**.

1. On the phone, set **API base** to `https://api.tele-pendant.jahbyte.com/api/v1` for the live API, or your computer’s LAN URL ending in `/api/v1` for a local stack (not `localhost` on a physical phone).
2. Email and password are the same as step 0.
3. Tap **Sign in**.
4. **Success:** title **Tele-Pendant**, **Logout**, and the six header buttons. Operator shows banner `Safety: normal · H … mm`, a **SAFE_ACTION_PIN** field, and the same five cells.
5. Press and hold **Hoist Up**. **Success:** banner includes **DEADMAN** and the held cell gets a green border. Height in the banner increases. Release: **DEADMAN** clears.
6. Open **Media**. Tap **Listen** (Expo Go explains that speech needs `npx expo run:android`). Tap **UP**, then **DOWN**. **Success:** **Heard: up. Executed: Hoist Up**, then the same line for **down** / **Hoist Down**. Type a known code or scan a QR with the camera and tap **Resolve**. **Success:** the code’s label.
7. Open **Face**. **Success:** the sentence **Convenience match only — not certified biometrics. Fail closed to password.**
8. Open **Ops**. **Success:** diagnostics, alarms (**Ack** and **Shelve** when one is active), and the height trend.
9. Open **Config**. Change a register address or a cell label and save, then set it back. **Success:** a saved line.
10. Open **Audit**. **Success:** the same list as the web (email, action, resource, result, time).
11. Last, type `change-me-admin-password` in **SAFE_ACTION_PIN** and press **STOP**. **Success:** the banner shows **e_stop**. This latches the simulator the same way as the web STOP.

## Tour help (web and phone)

- **Tour help** is **off** by default. The UI looks the same until you enable it.
- Turn **Tour help** on (login page, operator header, or phone header). Every annotated control shows a **?** tip with the same plain-language text as `PLAIN_LANGUAGE_GUIDE.md`.
- With Tour help on, press **Start tour** for a step-by-step overlay on the **current screen** (Next / Back / Done). Done leaves explain mode on until you toggle Tour help off.
- Preference is local only: web `localStorage` key `tourEnabled`, phone AsyncStorage key `tourEnabled`.

## Languages, alarms, trends, safety roles, and OPC UA

- The **Language** menu on the sign-in page follows the browser until you pick English, Español, Français, or Deutsch. That choice is saved on your user and then wins over the browser. The phone uses the device language the same way. To add a language: copy `packages/shared/i18n/en.json` to a new code, translate keys, register it in `packages/shared/src/i18n.ts`, and add it to the web/mobile pickers.
- **Config** can create, edit, and delete alarm definitions (register, operator, threshold, severity). **Ops** still only acknowledges and shelves active alarms.
- Mark a register **Trend**. **Ops** draws an SVG line for each trended series. Height and load start trended.
- **Safety roles** bind E-stop, deadman, heartbeat, and safe-state to registers. Losing the deadman, the link, or e-stop clears the primary coil of every motion cell.
- **Protocol** is Modbus TCP by default (simulator port 1502). OPC UA is optional: `docker compose -f docker-compose.dev.yml --profile opcua up opcua-sim`, then set the connection to OPC UA and fill each register’s node id (`ns=1;s=HoistUp` and the matching names).
- The phone operator screen shows the same plant graphic, photo, and live labels as the web. Buttons stay the action name.
- Phone **Listen** needs `npx expo run:android` in `apps/mobile`. Expo Go keeps **UP** and **DOWN**.
- Face login uses a 3-pose challenge with local liveness and optional AES template encryption. It is not ISO-certified and never authorizes e-stop. See `FACE_LIMITATIONS.md`.

## Security (operators & integrators)

- Prefer **HTTPS** in production (`COOKIE_SECURE=true`, TLS on the reverse proxy). See `INSTALLATION.md`.
- Keep `JWT_SECRET`, `ADMIN_PASSWORD`, `SAFE_ACTION_PIN`, and `FACE_TEMPLATE_KEY` strong and unique per environment (never commit real secrets).
- Login and face endpoints are **rate-limited**. Face templates stay on the server (never returned to clients).
- PIN policy: supervisors enter `SAFE_ACTION_PIN` for e-stop / safe actions. Face auth must never replace that PIN.
- Roles (operator / supervisor / admin) gate Config, Audit, and safety actions via JWT.

## What this software does not do

> **Software supervision only:** Deadman, e-stop, communication watchdog, and safe-state supervise the HMI/API path over Modbus/OPC UA. They are **not** a SIL/PL certified safety function and do not replace a hardwired safety relay or safety PLC. See `REAL_PLC_WIRING.md`.
