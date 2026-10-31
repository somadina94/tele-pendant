# Manual test plan (simulator)

Follow [USER_MANUAL.md](./USER_MANUAL.md) click by click. This table is the pass/fail list for the same order. Web base URL for this dev stack is **http://localhost:8080**. API is **http://localhost:3010**.

Do row 15 (STOP with PIN) last. It latches until `docker restart tele-pendant-modbus-sim-dev`.

| # | Screen | Click / action | Success |
| --- | --- | --- | --- |
| 1 | — | Open http://localhost:3010/api/v1/health | `status` is `ok` |
| 2 | — | Open http://localhost:3010/api | Swagger UI loads |
| 3 | `/` | **Sign in** (only if logged out) | Lands on `/operator` |
| 4 | `/operator` | Look, do not press yet | **Safety: normal**; overlays Height / Load / Motor; buttons **Hoist Up**, **Trolley L**, **STOP**, **Trolley R**, **Hoist Down**; nav **Media**, **Assistant**, **Face**, **Ops**, **Config**, **Logout** |
| 5 | `/operator` | Hold **Hoist Up** ~2s, then release | While held: **deadman HOLD**, height rises, motor **RUN**. After release: HOLD gone, **IDLE**, height stays |
| 6 | `/operator` | Hold **Hoist Down**, then release | Height falls, same deadman / RUN / IDLE behavior |
| 7 | `/operator` | Hold **Trolley L**, then **Trolley R** | **deadman HOLD** only while pressed; no red error |
| 8 | `/operator` | Click **STOP** with PIN empty | Red **Safe-action authorization required**; banner stays **normal** |
| 9 | `/media` | Click **Resolve** on `TP-CRANE-DEMO-01` | Navigates to `/operator` |
| 10 | `/media` | Click code button **TP-OPS** | Navigates to `/ops` |
| 11 | `/media` | **Resolve** `NOT-A-CODE` | Stays on Media; **Unknown code** |
| 12 | `/media` | **Scan QR / barcode in frame** | **No code in frame**, or BarcodeDetector unsupported, or a camera permission error |
| 13 | `/media` | **Listen (5s)** and say **hoist up** | **Executed: Hoist Up**; height increases on Operator |
| 14 | `/media` | **Listen (5s)** and say a nonsense phrase | **Not executed: command_not_allowlisted** |
| 15 | `/ops` | Wait for polls | **PLC connected: true (demo-simulator)**; **Safety mode: normal**; **Watchdog OK: true**; height trend lines in mm |
| 16 | `/admin` | Read lists | **demo-simulator — modbus-sim:1502**; five cells listed; no edit controls |
| 17 | `/assistant` | **Ask** with **What happens on lost Modbus?** | Bullet **Lost communications** plus the no-cloud-LLM note |
| 18 | `/assistant` | **Ask** `deadman` | Bullet **Deadman hold** |
| 19 | `/face` | **Enroll** while signed in, camera allowed | Limitation sentence about basic convenience match |
| 20 | `/face` | **Logout**, then **Face login** with the same face | Lands on `/operator`. Mismatch: **Face match failed — use password login** |
| 21 | `/operator` | Type `SAFE_ACTION_PIN`, click **STOP** | Banner **Safety: e_stop** and **E-STOP** |
| 22 | `/ops` | Read alarms, click **Ack** | **[critical] E-Stop asserted** goes from **active** to **acked** |
| 23 | `/operator` | Hold **Hoist Up** during e-stop | **Motion blocked**; height does not rise |
| 24 | — | `docker restart tele-pendant-modbus-sim-dev` | Banner returns to **normal**; hoist works again |
| 25 | `/operator` | **Logout** | Sign-in page; `/operator` redirects to `/` |
| 26 | Expo | **Sign in**, hold **Hoist Up** | Banner `Safety: normal`, **DEADMAN** while held, height increases |

Security checklist: helmet on, throttling on, HTTPS on a VPS, secrets only in `.env`, Modbus simulator not exposed on the public internet.
