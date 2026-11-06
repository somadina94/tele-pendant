# Tele-Pendant: plain-language guide

This document explains **what the app is**, **everyday words and buzzwords**, **how to use the controls**, and **what each configuration setting means**. It is written for operators, supervisors, and plant managers who do not need to read code.

For step-by-step click tests, use [USER_MANUAL.md](./USER_MANUAL.md). For installing the system, use [INSTALLATION.md](./INSTALLATION.md).

---

## What is Tele-Pendant?

Tele-Pendant is a **remote control panel** for industrial equipment (the demo is a **crane**). You use it on:

- A **web browser** on a computer or tablet
- A **phone app** (Expo) that talks to the same server

The app does **not** move the crane by itself. It sends instructions to a **PLC** (the machine’s brain) over a network link. In training, a **simulator** pretends to be that PLC so you can practice safely.

Think of it as: **sign in → see a picture of the plant → press buttons → numbers update live**.

---

## Buzzword glossary (simple definitions)

| Word | Plain English |
| ---- | ------------- |
| **HMI** | Human–Machine Interface; the screens and buttons people use to run the plant. Tele-Pendant is the HMI. |
| **Tele-pendant** | A portable or remote pendant (control box). Here it is software instead of a physical box on a cable. |
| **PLC** | Programmable Logic Controller; industrial computer that reads sensors and drives motors. |
| **Modbus TCP** | A common “language” on the network for reading/writing PLC memory. Default in this project. |
| **OPC UA** | Another network language for PLCs. Optional; used when the plant standard is OPC UA instead of Modbus. |
| **Register / address** | A numbered slot in PLC memory (like a mailbox). Buttons and labels are wired to specific slots. |
| **Coil** | A register type that is usually **on/off** (start hoist, stop, e-stop). |
| **Holding register** | A register type that holds **numbers** (height in mm, load in kg). |
| **Discrete input** | A register type that reports **status bits** from the field (motor running yes/no). |
| **Simulator** | Fake PLC for demos and training (`demo-simulator` in Config). |
| **Deadman** | Safety idea: motion only while you **keep holding** the button. Let go → motion stops. |
| **E-stop / emergency stop** | Stop everything urgently. **STOP** is one press. The **Reset PIN** only clears that stop. |
| **Safe-action PIN** | Secret used only to **reset** e-stop. Pressing **STOP** does not ask for it. The field is labeled **Reset PIN**. |
| **Safety mode** | Overall state: usually **normal**, or **e_stop** after an emergency stop, or problems like lost communications. |
| **Watchdog** | “Is the link still alive?” check. If the app stops hearing from the PLC, it treats that as unsafe. |
| **Heartbeat** | A register the system expects to see changing; proves the PLC link is healthy. |
| **Safe state** | A register that tells the app whether the machine considers itself safe to move. |
| **Alarm** | A rule like “if height > X, show warning.” **Active** alarms appear on Ops. |
| **Ack (acknowledge)** | Operator says “I have seen this alarm.” Does **not** fix the machine by itself. |
| **Shelve** | Temporarily hide an alarm from the active list without clearing the underlying condition. |
| **Trend** | Store history of a number over time (e.g. hoist height) and draw a simple chart on Ops. |
| **Live labels / overlays** | Text boxes on the plant picture (Height, Load, Motor) that update from the PLC. |
| **Control matrix / cells** | The grid of buttons (Hoist Up, STOP, etc.). Each **cell** sits in a row/column and points at PLC registers. |
| **QR / barcode** | Scannable codes that jump you to a screen (e.g. crane operator view). |
| **Voice command** | Say **up** or **down** (allowlisted words) to run hoist briefly; demo convenience. |
| **OTA** | Over-the-air update for the **phone app’s JavaScript** without reinstalling from the store (still needs native rebuild for camera changes). |
| **Audit** | A log of who changed settings or triggered important actions. |
| **JWT / session** | After login, the browser keeps a secure token so you stay signed in for a while. |
| **SQLite** | A small database file on the server where layouts, users, and alarm rules are stored. |
| **API** | The server program the web and phone talk to. |
| **Swagger** | A technical web page listing all API endpoints; mainly for developers. |

---

## Who can do what (roles)

| Role | Typical person | Operator screen | STOP / safe PIN | Config (save) | Audit list |
| ---- | -------------- | --------------- | --------------- | ------------- | ---------- |
| **Operator** | Line operator | Yes | **STOP** is one press. **Reset PIN** clears it | Can open; **Save** may be denied | May be denied |
| **Supervisor** | Shift lead | Yes | Yes | Yes | Yes |
| **Admin** | IT / integrator | Yes | Yes | Yes | Yes |

The demo admin account is set in the server environment (`ADMIN_EMAIL` / `ADMIN_PASSWORD`). The reset PIN is `SAFE_ACTION_PIN` in that same file.

---

## Screens at a glance

After sign-in, the top menu on the **Operator** page links to:

| Menu | Purpose |
| ---- | ------- |
| **Operator** | Main control: picture, live numbers, button matrix. |
| **Media** | Camera, QR/barcode, voice shortcuts. |
| **Assistant** | Ask questions about manuals and how the pendant works (local search; optional Cursor Agent if `CURSOR_API_KEY` is set). |
| **Face** | Optional local face login with challenge liveness (not ISO-certified; see [FACE_LIMITATIONS.md](./FACE_LIMITATIONS.md)). |
| **Ops** | Alarms, trends, connection diagnostics. |
| **Config** | Admin: PLC connection, registers, buttons, labels, alarms, safety bindings. |
| **Audit** | Who did what and when. |
| **Logout** | End your session. |

On the **phone app**, the same areas appear as tabs/buttons in the header after you set **API base** to your server (e.g. `https://api.tele-pendant.jahbyte.com/api/v1`).

**Language:** The interface is available in **English, Spanish, French, and German** (en, es, fr, de). On the login page the menu offers the installed languages. That choice is saved on your user profile and overrides the browser language.

**Tour help (optional):** Off by default on web and phone. Turn on **Tour help** to show a small **?** on each annotated control; tap or click it for a plain-language tip. While Tour help is on, **Start tour** runs a short Next / Back / Done walkthrough for the **current screen** only. Turning Tour help off again hides tips and ends any walkthrough. The preference stays on this device (`tourEnabled` in browser storage or phone AsyncStorage); it is not stored on the server.

---

## Operator screen: controls in detail

### Safety banner (top colored strip)

Shows **Safety:** followed by a mode, for example:

- **normal**: You may move the crane if you follow deadman rules.
- **e_stop**: Emergency stop is active; motion buttons should be blocked.
- **deadman HOLD** (while you hold a motion button); You are actively holding a move; release to stop pulsing motion.
- **E-STOP**: The e-stop register is active.

Treat the banner as your first glance before pressing anything.

**First load:** After sign-in, the operator page waits until the saved HMI layout and (when needed) the first live tag update are ready before showing the matrix. You may see a short **Operator** loading state instead of empty buttons. A layout error shows a message rather than placeholder cells.

### Plant graphic (left side)

- **Background**: Gradient or photo from Config (photo URL wins if set).
- **Live labels**: e.g. **Height** (mm), **Load** (kg), **Motor** (RUN/IDLE). Values refresh over a live connection (websocket), not only when you refresh the page.
- **Tag strip**: Short summary line: `H … mm`, `Load … kg`, `RUN` or `IDLE`.

### Control matrix (right side)

Default demo layout (empty corners):

| | Left | Center | Right |
| --- | --- | --- | --- |
| Top | n/a | **Hoist Up** | n/a |
| Middle | **Trolley L** | **STOP** | **Trolley R** |
| Bottom | n/a | **Hoist Down** | n/a |

**How to use motion buttons (Hoist Up/Down, Trolley L/R)**

1. **Press and hold**: Do not just tap once.
2. While held, the banner shows **deadman HOLD** and the simulator runs motion (hoist height changes on Up/Down).
3. **Release**: Motion stops; height stays where it landed (it does not rewind).

**STOP button**

1. Click **STOP**. No PIN.
2. The banner changes to **e_stop** and shows **E-STOP**. Motion buttons will not run.
3. To run again, type the **Reset PIN** and click **Reset e-stop**. A wrong PIN shows **PIN does not match** and leaves the stop latched.
4. With the correct PIN, and the e-stop coil clear, safety mode returns to **normal**.

**Safe-action PIN row**

- Label **Reset PIN**, password field, and **Reset e-stop** on **one horizontal row** (desktop and mobile) to save vertical space.
- Used only to **reset** e-stop. It is not required to press **STOP**.
- Hidden like a password field (`SAFE_ACTION_PIN` on the server; not your login password).

---

## Account menu (web header)

| Item | Who | What it does |
| ---- | --- | ------------ |
| **Change password** | Any signed-in user | Updates **login** password (current + new + confirm, min 8 chars). Does not change `SAFE_ACTION_PIN`. |
| **Add operator** / **Add supervisor** / **Manage users** | Admin only | Opens Config **Users** (`/admin?section=users`) to create or manage accounts. |

**Logout** stays in the sidebar footer. Suspended accounts see **Account suspended; contact an administrator** at sign-in.

---

## Media screen: controls

| Control | What it does |
| ------- | ------------ |
| **Device camera** | Shows live video; **Scan QR / barcode in frame** tries to read a code from the image. Needs camera permission. |
| **Manual code field + Resolve** | Type a known code (demo: `TP-CRANE-DEMO-01`) and jump to the linked screen. |
| **Code shortcut buttons** | Same as Resolve for preset codes (crane → Operator, `TP-OPS` → Ops). |
| **Listen (8s)** | Browser or device speech recognition. Say allowlisted words. **up** / **down** run a ~2 s timed hoist only when **Allow timed media motion** is checked in Config **Safety roles** and saved (off by default). No separate UP/DOWN tap buttons on Media. |

**Plant CCTV later:** The Media screen uses the device camera. An administrator can connect a plant camera on the server. The screen then says **Plant camera configured**.

**Voice security:** Only allowlisted words run motion. Random speech shows “not executed.” Saying **stop** commands the crane to stop without a PIN. Timed **up** / **down** stay off until an admin checks **Allow timed media motion** under Config **Safety roles** and saves.

---

## Ops screen: controls

| Section | Meaning |
| ------- | ------- |
| **PLC connected** | `true` / `false` and which connection label (e.g. `demo-simulator`). |
| **Safety mode** | Same idea as the Operator banner (`normal`, `e_stop`, etc.). |
| **Watchdog OK** | `true` if the supervision logic is happy with the link. |
| **Uptime** | How long the API process has been running (seconds). |
| **Alarms** | List of active/acked/shelved events with severity. |
| **Ack** | Mark alarm as acknowledged (seen). |
| **Shelve** | Mark alarm as shelved (hidden from active attention). Use one or the other per alarm state rules. |
| **Trends** | Simple history of registers marked **Trend** in Config (height, load by default). |

Ops refreshes every couple of seconds automatically.

---

## Assistant screen

- Ask questions in plain language about **deadman**, **Modbus**, **alarms**, **wiring**, HMI features, etc.
- Docs settings: set the **docs folder path** and an optional **docs link** (admins), then **Save** / **Reindex**.
- Default answers use the **local search index** on your server.
- If the server has `CURSOR_API_KEY`, answers can be synthesized by the **Cursor Agent** using those manuals plus a feature handbook. Still **advisory only**: it does not move the crane or change PLC bits.

---

## Face screen

- **Enroll**: After password login, capture your face once for quicker login later.
- **Face login**: Match against stored template; if unsure, use password.
- **Not** certified biometrics; photos or twins could fool it. See [FACE_LIMITATIONS.md](./FACE_LIMITATIONS.md).

---

## Audit screen

Read-only list: user email, action name, resource, success/fail, time. Useful after Config changes (`register.update`, `cell.update`, etc.). Operators may see an authorization error; supervisors/admins see the full list.

---

## Config screen: every section explained

Only **supervisor** and **admin** should rely on saving here. Settings persist in the server **SQLite** database until changed again.

### PLC connections

Connects the app to real hardware or the simulator.

| Field | Meaning |
| ----- | ------- |
| **Label** | Friendly name shown in Ops (“Building 3 crane PLC”). |
| **Host** | IP address or hostname of the PLC (demo: `modbus-sim` inside Docker). |
| **Port** | Network port. Modbus often uses **502**; demo simulator uses **1502**. |
| **Unit id** | Modbus slave number (usually **1**). |
| **Protocol** | **Modbus TCP** (default) or **OPC UA** (needs node ids on registers). |
| **Use this PLC** | Checkbox: only **one** connection should be enabled at a time. |
| **Save / Add PLC** | Writes settings and tries to open the connection. Message **Saved and connecting.** or an error if the host is unreachable. |

### Register maps

Each row is one **named signal** the app understands.

| Field | Meaning |
| ----- | ------- |
| **Name** | Internal label (e.g. `coil.hoistUp`, `holding.hoistHeightMm`). |
| **Kind** | **coil**, **holding**, or **discrete**: see glossary. |
| **Address** | Modbus number (must match PLC program). |
| **Node id** | OPC UA address (e.g. `ns=1;s=HoistUp`) when protocol is OPC UA. |
| **Trend** | Checkbox: record history for Ops charts. |
| **Save** | Stores address/trend/node for that signal. |

Demo crane uses addresses like coil **0** = hoist up, holding **0** = height mm, etc. (full list in [USER_MANUAL.md](./USER_MANUAL.md) § Config).

### Cells (control matrix buttons)

Each button is a **cell** with grid position and up to three PLC links:

| Field | Meaning |
| ----- | ------- |
| **Row / Col** | Position in the matrix (0-based). |
| **Cell label** | Text on the button (“Hoist Up”). |
| **Style** | Visual style class. STOP uses `estop` (saturated red). |
| **Is motion** | If checked, button uses **deadman** (hold to run). |
| **Requires safe action** | Marks the STOP cell so it cannot be deleted. Pressing it does not ask for a PIN. |
| **Primary register** | Main coil/command sent to PLC. |
| **Feedback register** (optional) | e.g. motor running. |
| **Status register** (optional) | e.g. height value shown under the button. |
| **Add cell / Delete** | Extend or remove buttons. |

### Live labels

Floating text on the plant image.

| Field | Meaning |
| ----- | ------- |
| **Label** | Title shown (Height, Load, Motor). |
| **X / Y** | Position as percent across the picture. |
| **Format** | How to show the number; `{value}` is replaced by live reading. |
| **Register** | Which holding/discrete signal feeds the label. |

### Background

| Field | Meaning |
| ----- | ------- |
| **Name** | Title on the graphic panel. |
| **CSS background** | Color gradient if no photo. |
| **Image URL** | Photo of the bay; if set, overrides CSS. |

### Alarm definitions

Rules evaluated against live registers.

| Field | Meaning |
| ----- | ------- |
| **Name** | Alarm text operators see. |
| **Register** | Which signal to watch. |
| **Operator** | **eq** (=), **gt** (>), **lt** (<), **neq** (≠). |
| **Threshold** | Number to compare against. |
| **Severity** | One of **info**, **warning**, or **critical** (dropdown when you define an alarm in Config; shown on Ops). |
| **Enabled** | Turn rule on/off. |

Ops handles **Ack** / **Shelve** on fired alarms; Config defines the rules.

### Safety roles

Tells the supervision logic which registers mean what:

| Binding | Role |
| ------- | ---- |
| **E-stop** | Register that indicates emergency stop active. |
| **Deadman** | Register pulsed while operator holds motion. |
| **Heartbeat** | Register proving PLC comms are alive. |
| **Safe state** | Register reporting machine-safe status. |
| **Allow timed media motion** | Checkbox (default off). When on and saved, Media voice **up** / **down** may run a short timed hoist; does not add UP/DOWN buttons on Media. |

If deadman is lost, communications fail, or e-stop asserts, the system **clears motion coils** for safety.

### Users (admin only)

| Control | Meaning |
| ------- | ------- |
| **Table** | All accounts: display name, email, role, **Active** / **Suspended**. |
| **Edit** | Change name, email, role, suspension, or set a new password for that user. |
| **Suspend** / **Activate** | Block or restore sign-in without deleting the row. |
| **Remove** | Delete operator/supervisor accounts (admin row is protected). |
| **Add user** | Create operator or supervisor with email and password. |

Display names appear on audit rows when set.

---

## Server configuration (.env): in plain language

These live in the project `.env` file (copy from `.env.example`). Integrators set them once per environment.

| Setting | What it controls |
| ------- | ---------------- |
| `PORT` | Host port mapped to the API (3010 locally). |
| `WEB_PORT` | Host port for the web UI in Docker (8080). |
| `MODBUS_SIM_PORT` | Port for the demo crane simulator (1502). |
| `APP_URL` | Public URL of the API (browsers and phones call this). |
| `FRONTEND_URL` | Public URL of the web app (for cookies/CORS). |
| `COOKIE_SECURE` | `true` on HTTPS production sites. |
| `DATABASE_PATH` | Where the SQLite file lives. |
| `JWT_SECRET` | Secret used to sign login tokens; change in production. |
| `JWT_ACCESS_TOKEN_TTL` | How long login lasts (seconds). |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | First admin user seeded into the database. |
| `SAFE_ACTION_PIN` | PIN required to **reset** e-stop. Not required to press STOP. |
| `MODBUS_HOST` / `MODBUS_PORT` / `MODBUS_UNIT_ID` | Default PLC target when not using Config UI. |
| `CAMERA_RTSP_URL` | Optional fixed camera stream for Media. |

Production example URLs are listed in [README.md](../README.md) and [docs/README.md](./README.md).

---

## Phone app extras

| Topic | Plain explanation |
| ----- | ----------------- |
| **API base** | Must point to your server’s `/api/v1` URL. `localhost` only works on the same machine, not from a physical phone on Wi‑Fi. |
| **Change password** | Drawer item at the bottom; same flow as web **Account menu** → **Change password**. |
| **Native app** | Signed Android/iOS builds are delivered at handover (not in git). Rebuild with `pnpm handover:mobile` after you receive signing keys privately ([MOBILE_RELEASE.md](./MOBILE_RELEASE.md)). |
| **Listen (voice)** | Needs the native app or a local dev build; Expo Go cannot run on-device speech. |
| **OTA manifest** | Server URL `/ota/manifest` tells the app where to download JS updates. |

See [OTA.md](./OTA.md) for update workflow.

---

## What this software does **not** replace

Deadman, e-stop supervision, watchdog, and safe-state checks here are **software over the network**. They help training and integration but **do not replace**:

- Hardwired emergency stop circuits
- Safety relays or a **safety-rated PLC**
- Local plant rules and lockout/tagout procedures

Always follow your site’s real safety program. Software STOP is not a substitute for the red mushroom button on the machine.

---

## Quick reference: demo controls

| I want to… | Where | Action |
| ---------- | ----- | ------ |
| Raise hook | Operator | Hold **Hoist Up** |
| Lower hook | Operator | Hold **Hoist Down** |
| Move trolley | Operator | Hold **Trolley L** or **Trolley R** |
| Emergency stop | Operator | Click **STOP** (no PIN). Reset with **Reset PIN** |
| See why motion failed | Operator | Read red error + banner mode |
| Check connection | Ops | **PLC connected**, **Safety mode** |
| Clear alarm from my list | Ops | **Ack** or **Shelve** |
| Jump to crane screen | Media | Resolve `TP-CRANE-DEMO-01` |
| Change button text | Config | Edit cell label → Save |
| Point at real PLC | Config | New connection → **Use this PLC** → Save |
| Change language | Login | Language menu → English, Spanish, French, or German |
| Explain every control | Any | Turn on **Tour help**, tap **?** |
| Guided walkthrough | Any (tour on) | **Start tour** → Next / Back / Done |

---

## Related documents

| Document | Audience |
| -------- | -------- |
| [USER_MANUAL.md](./USER_MANUAL.md) | Click-through testing |
| [TRAINING.md](./TRAINING.md) | Classroom session outline |
| [REAL_PLC_WIRING.md](./REAL_PLC_WIRING.md) | Moving from simulator to plant |
| [MAINTENANCE.md](./MAINTENANCE.md) | Ongoing care |
| [FACE_LIMITATIONS.md](./FACE_LIMITATIONS.md) | Face login policy |
| [INSTALLATION.md](./INSTALLATION.md) | Setup |
