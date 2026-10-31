# Tele-Pendant — click-through test manual

Use this while the Docker dev stack is running. Every feature below is a click on the web UI, plus the Expo handheld at the end. Do the steps in order. **STOP is last** because it latches until the simulator is restarted.

## What is already running

| Check | Where | Success |
| --- | --- | --- |
| API | http://localhost:3010/api/v1/health | JSON `status` is `ok` |
| Swagger | http://localhost:3010/api | Swagger UI loads |
| Web | http://localhost:8080 | Tele-Pendant page (port comes from `WEB_PORT` in `.env`; this stack uses **8080**) |
| Simulator | host port **1502** | Container `tele-pendant-modbus-sim-dev` is up |

You are already signed in. The operator screen is http://localhost:8080/operator.

Sign-in values if you get logged out (from `.env`):

- Email: `ADMIN_EMAIL` (seed `admin@example.com`)
- Password: `ADMIN_PASSWORD` (seed `change-me-admin-password`)
- Safe-action PIN: `SAFE_ACTION_PIN` (seed is the same string as the admin password)

## 0. Sign in (only if you see the login page)

1. Open http://localhost:8080.
2. **Success:** heading **Tele-Pendant**, text **Sign in to operate the demo crane**, fields **Email** and **Password** already filled, button **Sign in**, link **Face login (basic)**.
3. Click **Sign in**.
4. **Success:** the address becomes `/operator`. You see **Demo crane operator HMI** and the top links **Media**, **Assistant**, **Face**, **Ops**, **Config**, **Logout**.

Wrong password shows a red error and you stay on the login page.

## 1. Operator screen — layout

Stay on http://localhost:8080/operator.

**Success, top to bottom:**

- Banner starts with **Safety: normal**. It does not say `deadman HOLD` or `E-STOP`.
- Left panel title **demo-crane**.
- Three overlays on the graphic: **Height** (about `1250 mm` at a fresh simulator), **Load** (`0 kg`), **Motor** (`IDLE`).
- Strip under the graphic: `H … mm`, `Load … kg`, and `IDLE`.
- Right panel title **Control matrix**.
- Password field labeled **Safe-action PIN (e-stop / dangerous)**, placeholder **supervisor PIN**.
- Five buttons in a 3×3 grid (corners are empty):

  |  | left | center | right |
  | --- | --- | --- | --- |
  | top | empty | **Hoist Up** | empty |
  | middle | **Trolley L** | **STOP** | **Trolley R** |
  | bottom | empty | **Hoist Down** | empty |

- Hint under the grid: **Hold motion buttons: deadman pulses while pressed. Release to stop.**

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
3. **Success:** a red error that includes **Safe-action authorization required (supervisor PIN)**. Banner stays **Safety: normal**. No **E-STOP** on the banner.

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
- Section **Voice commands**. Hint: **Allowlisted: hoist up/down, trolley left/right, stop**.
- Button **Listen (5s)**.

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

The page listens for up to 5 seconds, then posts the transcript. Motion phrases pulse deadman on the server, so you do not hold a matrix button.

1. Click **Listen (5s)**. Button label becomes **Listening…**.
2. Say **hoist up**.
3. **Success:** status line **Heard: hoist up**, then **Executed: Hoist Up**. On **Operator**, height is higher than before.
4. Repeat and say **nonsense phrase**.
5. **Success:** **Not executed: command_not_allowlisted**.
6. **stop** is allowlisted, but this page does not send the supervisor PIN, so **stop** must not show **Executed**. You may only see **Heard: stop**. Use the operator **STOP** button in step 10 for the real e-stop test.

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
- **Alarms:** **No active alarms** (until you press STOP in step 10).
- **Trend: hoist height (recent):** time-stamped lines ending in **mm**. After steps 2–3 and voice hoist, the mm values are not stuck only at the original 1250 if you held hoist long enough to move it. A line **No samples yet** means the poller has not written a sample yet — wait a few seconds and the list should fill.

There is an **Ack** button only after an alarm is **active**. There is no Shelve button on this screen.

## 8. Config (read-only)

From Operator, click **Config** (http://localhost:8080/admin).

**Success:**

- Heading **HMI config**, link **Operator**.
- Text: **DB-backed layout (SQLite). Edit maps in later admin CRUD; seed ships demo crane.**
- **PLC connections:** **demo-simulator — modbus-sim:1502 (simulator) · active**
- **Register maps** includes at least:
  - `coil.hoistUp · coil@0`
  - `coil.hoistDown · coil@1`
  - `coil.trolleyLeft · coil@2`
  - `coil.trolleyRight · coil@3`
  - `coil.eStop · coil@11`
  - `holding.hoistHeightMm · holding@0`
  - `holding.loadKg · holding@1`
  - `discrete.motorRunning · discrete@0`
- **Cells (3 PLC addresses each):**
  - `[0,1] Hoist Up` — primary `coil.hoistUp` / feedback `discrete.motorRunning` / status `holding.hoistHeightMm`
  - `[1,0] Trolley L` — primary `coil.trolleyLeft`
  - `[1,1] STOP` — primary `coil.eStop`
  - `[1,2] Trolley R` — primary `coil.trolleyRight`
  - `[2,1] Hoist Down` — primary `coil.hoistDown` / feedback `discrete.motorRunning` / status `holding.hoistHeightMm`

Nothing on this page is editable. That is expected.

## 9. Local assistant

From Operator, click **Assistant** (http://localhost:8080/assistant).

**Success, before you ask:**

- Heading **Local assistant**, link **Operator**.
- Text: **Document search over shipped manuals — no cloud LLM, no API keys.**
- **Question** field prefilled with **What happens on lost Modbus?**
- Button **Ask**.

1. Click **Ask**. The button briefly says **Searching…**.
2. **Success:** a block of bullet lines. One of them is **Lost communications** and mentions **comms_lost**, clearing motion coils, and a safe-state register. The note at the bottom is **No cloud LLM — retrieval over shipped manuals / seed tips only.**

Optional second question: replace the text with **deadman** and click **Ask**. **Success:** a bullet **Deadman hold** about holding the control and releasing to stop motion.

A question with no matching words shows **No local documents matched. Try words like deadman, e-stop, Modbus, alarm, or PLC wiring.**

## 10. Face (basic)

From Operator, click **Face** (http://localhost:8080/face). You must already be signed in before enroll.

**Success, page chrome:**

- Heading **Face auth (basic)**.
- Link **Password login**.
- Text: **Convenience match only — not certified biometrics. Fail closed to password.**
- Field **Email hint (login)** = `admin@example.com`.
- Buttons **Enroll (requires logged-in session)** and **Face login**.
- A live camera preview, or a short error if the browser blocked the camera.

1. Allow the camera if prompted.
2. Click **Enroll (requires logged-in session)**.
3. **Success:** status line **Basic convenience match only — not a high-assurance biometric product. Prefer password when unsure.**
4. Click **Logout** is not on this page. Open http://localhost:8080, or click **Password login** and, if you are still signed in, go to Operator and click **Logout** so the login page is showing. Then open http://localhost:8080/face again.
5. Leave **Email hint (login)** as `admin@example.com`. Click **Face login** with the same face in frame.
6. **Success:** you land on **/operator** with the matrix visible (a new session). The match is a basic histogram, not certified biometrics. If the frame does not match, the status line includes **Face match failed — use password login** and you stay signed out. Sign in with email and password from step 0 and continue.

Click **Enroll** while logged out. **Success:** **Sign in with password first, then enroll**.

## 11. STOP with PIN (do this last)

1. On http://localhost:8080/operator, click the **Safe-action PIN** field.
2. Type the `SAFE_ACTION_PIN` from `.env` (seed value `change-me-admin-password`).
3. Click **STOP**.
4. **Success:**
   - Banner becomes **Safety: e_stop** and includes **E-STOP**.
   - Red safe-action error is gone.
5. Open **Ops**.
6. **Success:**
   - **Safety mode: e_stop**
   - **Alarms** shows **[critical] E-Stop asserted — active**
   - An **Ack** button sits on that row
7. Click **Ack**.
8. **Success:** that row’s state changes from **active** to **acked**. The **Ack** button disappears. The banner on Operator stays **e_stop** (ack does not clear the coil).
9. Back on Operator, hold **Hoist Up**.
10. **Success:** motion is rejected. Red text includes **Motion blocked: hold deadman and ensure normal safety mode**. Height does not climb.

### Clear e-stop so you can move again

There is no reset button on the HMI. The simulator latches the e-stop coil.

```bash
docker restart tele-pendant-modbus-sim-dev
```

Wait a few seconds. **Success:** Operator banner returns to **Safety: normal**, Ops **PLC connected: true**, and holding **Hoist Up** moves height again. You may see **comms_lost** for a moment while the simulator restarts.

## 12. Logout

1. On Operator, click **Logout**.
2. **Success:** you are on `/` (the sign-in form). Opening http://localhost:8080/operator sends you back to sign-in.
3. Sign in again with **Sign in** if you want to keep testing.

## 13. Expo handheld (separate from the browser)

The phone app is sign-in plus the same matrix. It does not include Media, Assistant, Face, Ops, or Config.

1. On the phone, set **API base** to your computer’s LAN URL, for example `http://192.168.x.x:3010` (not `localhost`).
2. Email and password are the same as step 0.
3. Tap **Sign in**.
4. **Success:** title **Tele-Pendant**, a **Logout** link, banner `Safety: normal · H … mm`, and the same five cells: **Hoist Up**, **Trolley L**, **STOP**, **Trolley R**, **Hoist Down**.
5. Press and hold **Hoist Up**. **Success:** banner includes **DEADMAN** and the held cell gets a green border. Height in the banner increases. Release: **DEADMAN** clears.
6. **STOP** on the phone uses the same PIN rules as the web app. The phone screen has no PIN field, so **STOP** from the phone is expected to fail until a PIN is supplied by the API. Use the web Operator screen for the PIN test in step 11.

## What this software does not do

Deadman, e-stop, watchdog, and safe-state are software checks over Modbus. They do not replace a hardwired safety relay or a safety PLC.
