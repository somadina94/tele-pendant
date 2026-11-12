# Register a real PLC (step by step)

This guide replaces the demo Modbus simulator with a **real** plant PLC. You work in **Config** (web `/admin`, or Expo **Config**). Software supervision (deadman / e-stop / watchdog) is **not** a SIL/PL certified safety function and does **not** replace a hardwired e-stop or safety PLC.

The pretend machine is the **demo-simulator** row (host `modbus-sim` or `127.0.0.1`, port `1502`). Both the older crane screen and the **demo-p03a21** welding pendant use it. Keep that row for lab tests; add a second row for the real machine.

---

## The server must be on the factory network

The phone or iPad does not talk to the machine. It talks to the Tele-Pendant **server**, and the server talks to the machine.

The machine’s address is private (for example `192.168.10.50`). Only devices on the same factory Wi-Fi or cables can open it. The public website cannot.

Run the server on a computer joined to that factory Wi-Fi. A local dev server on that same Wi-Fi is the usual example. On the phone, open the app at that computer’s address (for example `http://192.168.10.20:3010`), not the site hosted abroad. In **Config**, set **Host** to the machine’s private address.

Standing in the factory with the phone, while the server stays abroad, does not connect the machine.

---

## P03A21 pendant (milestone-1)

Operator tab **demo-p03a21** is the soft pendant. Each rocker is one control and writes two coils; pressing one side clears the other. Jog rockers also require **Enable** held.

The live demo numbers are **not** the Siemens wiring-sheet names. The sheet uses names such as `I200.3` and `Q200.4`. Modbus only accepts a plain coil number. Those Siemens names are comments in `packages/modbus-core/src/pendant-p03a21-map.ts`. The app does not send them.

Do not type `I200.3` into **Address**. Ask the controls engineer for the Modbus coil (or OPC UA node id) that their program uses for that sheet name, then save that number on the matching register. The client can do this themselves in **Config** on web or on the phone. They do not have to send the list to the developer.

Demo coils sit at **20–66** so they do not collide with crane safety coils `coil.deadman` (10) and `coil.eStop` (11). **Enable** is one demo coil (`43`). The sheet lists two Siemens inputs (`I384.2` and `I384.6`); the real program may still be two signals. **Buttons active** is indicator lamp P01 (`coil.p03a21.do.buttonsActive` / Q200.0); the local DI `42` is unused by the HMI cell.

| Register name (do not rename) | Demo coil | Sheet note (comment only) |
| ----------------------------- | --------- | ------------------------- |
| `coil.p03a21.di.teachSeamTrackingLaser` | `20` | I200.0 -S01 |
| `coil.p03a21.di.seamTrackingOnOff` | `21` | I200.1 -S02 |
| `coil.p03a21.di.moveWeldingPosition` | `22` | I200.2 -S03 |
| `coil.p03a21.di.owcvaDown` | `23` | I200.3 -S04:24 |
| `coil.p03a21.di.owcvaUp` | `24` | I200.4 -S04:14 |
| `coil.p03a21.di.moveHomePosition` | `25` | I200.5 -S05 |
| `coil.p03a21.di.owvaUp` | `26` | I200.6 -S06:24 |
| `coil.p03a21.di.owvaDown` | `27` | I200.7 -S06:14 |
| `coil.p03a21.di.teachPipeMiddle` | `28` | I201.0 -S07 |
| `coil.p03a21.di.owhaBack` | `29` | I201.1 -S08:24 |
| `coil.p03a21.di.owhaFwd` | `30` | I201.2 -S08:14 |
| `coil.p03a21.di.axisFastSlowly` | `31` | I201.3 -S09 |
| `coil.p03a21.di.owcaBack` | `32` | I201.4 -S10:24 |
| `coil.p03a21.di.owcaFwd` | `33` | I201.5 -S10:14 |
| `coil.p03a21.di.owwacUp` | `34` | I201.6 -S11:24 |
| `coil.p03a21.di.owwacDown` | `35` | I201.7 -S11:14 |
| `coil.p03a21.di.owvaHeightReg` | `36` | I202.0 -S12 |
| `coil.p03a21.di.owwdcUp` | `37` | I202.1 -S13:24 |
| `coil.p03a21.di.owwdcDown` | `38` | I202.2 -S13:14 |
| `coil.p03a21.di.teachWeldingPosition` | `39` | I202.3 -S14 |
| `coil.p03a21.di.owffClose` | `40` | I202.4 -S15:24 |
| `coil.p03a21.di.owffOpen` | `41` | I202.5 -S15:14 |
| `coil.p03a21.di.buttonsActive` | `42` | local demo input |
| `coil.p03a21.di.enable` | `43` | I384.2 / I384.6 collapsed |
| `coil.p03a21.do.buttonsActive` | `50` | Q200.0 -P01 |
| `coil.p03a21.do.teachSeamTrackingLaser` | `51` | Q200.1 -P02 |
| `coil.p03a21.do.seamTrackingOnOff` | `52` | Q200.2 -P03 |
| `coil.p03a21.do.moveWeldingPosition` | `53` | Q200.3 -P04 |
| `coil.p03a21.do.owcvaSelector` | `54` | Q200.4 -P05 |
| `coil.p03a21.do.moveHomePosition` | `55` | Q200.5 -P06 |
| `coil.p03a21.do.owvaSelector` | `56` | Q200.6 -P07 |
| `coil.p03a21.do.moveWeldingPositionAlt` | `57` | Q200.7 -P08 |
| `coil.p03a21.do.owhaSelector` | `58` | Q201.0 -P09 |
| `coil.p03a21.do.axisFastSlowly` | `59` | Q201.1 -P10 |
| `coil.p03a21.do.owcaSelector` | `60` | Q201.2 -P11 |
| `coil.p03a21.do.owwacSelector` | `61` | Q201.3 -P12 |
| `coil.p03a21.do.owvaHeightReg` | `62` | Q201.4 -P13 |
| `coil.p03a21.do.owwdcSelector` | `63` | Q201.5 -P14 |
| `coil.p03a21.do.teachWeldingPosition` | `64` | Q201.6 -P15 |
| `coil.p03a21.do.owffSelector` | `65` | Q201.7 -P16 |
| `coil.p03a21.do.teachPipeMiddle` | `66` | demo lamp for Teach Pipe Middle |

Lamp coils (`coil.p03a21.do.*`) are indicator feedback. On the simulator they echo the related button (P01 **Buttons active** follows Enable; Teach Pipe Middle has its own DO). On a real machine, point them at the PLC bits that actually light those lamps.

On **Operator → demo-p03a21**: claim control, press **CLOSE** then **OPEN** on **OWFF** (one side stays on), then hold **Enable** and hold **UP** on **OWCVA**. Without **Enable**, jog rockers and Move Home / Move Welding show **Hold Enable before using motion controls**. A mouse has one pointer, so holding **Enable** and a rocker at the same time needs two fingers (phone or tablet) unless Enable is latched in the PLC.

---

## What you need from the machine / controls team

Ask the PLC programmer or controls engineer for a short **I/O map** before you type anything in Tele-Pendant:

| Ask for | Why |
| ------- | --- |
| Protocol | Modbus TCP (default) or OPC UA |
| PLC IP address on the plant LAN | Config **Host** |
| TCP port | Usually `502` (Modbus) or `4840` (OPC UA) |
| Modbus unit / slave ID | Config **Unit id** (often `1`) |
| For each signal: name, type (coil / discrete / holding / input), **0-based or 1-based address**, and R/W | Config **Register maps** |
| Which coil is e-stop / deadman / motion | Safety + Operator buttons |
| Which holding is height / load / heartbeat / safe-state | Overlays, trends, watchdog |
| Firewall / VLAN allow from Tele-Pendant server → PLC | Ops must show **PLC connected: true** |

Addresses in Tele-Pendant are **0-based Modbus addresses** (same convention as the demo map). If the vendor sheet is **1-based**, subtract 1 when you enter the number (confirm with the controls engineer).

---

## Example values (lab-style real PLC)

These are **examples only**. Replace with your plant map.

### PLC connection (Config → Add a PLC / Save)

| Field in UI | Example | Where to get it on a real machine |
| ----------- | ------- | --------------------------------- |
| **Label** | `bay-a-plc` | Your name for this crane/bay (any short string). |
| **Host** | `192.168.10.50` | PLC Ethernet IP from the network settings, PLC web panel, or controls network diagram. Ping it from the API host. |
| **Port** | `502` | Modbus TCP almost always `502`. Confirm in PLC Ethernet / Modbus server settings. |
| **Unit id** | `1` | Modbus slave / unit / station ID in the PLC program or gateway (often `1`; some gateways use `0` or `255`). |
| **Protocol** | `Modbus TCP` | From the controls team. Use **OPC UA** only if that is what the PLC exposes (see last section). |
| **Use this PLC** | checked | Makes this the active connection. Uncheck demo-simulator’s box when you switch. |

Click **Add PLC** (new) or **Save \<label\>** (existing). Success text: **Saved and connecting.**

### Register maps (Config → Register maps)

Keep the **names** Tele-Pendant already uses (`coil.p03a21.di.owcvaUp`, `coil.eStop`, `holding.hoistHeightMm`, …). Change only **Address** (and **Node id** if OPC UA) to match the real program. Names stay stable so Operator cells keep working.

The table below is the **older crane demo**. For the welding pendant, change the `coil.p03a21.*` rows in the section above. Example real addresses here are samples, not the client’s sheet.

| Register name (do not rename) | Kind | Demo address | Example real address | Where to get it |
| ----------------------------- | ---- | ------------ | -------------------- | --------------- |
| `coil.hoistUp` | coil | `0` | `20` | Coil / digital output that starts hoist up in the PLC tag list |
| `coil.hoistDown` | coil | `1` | `21` | Hoist down command coil |
| `coil.trolleyLeft` | coil | `2` | `22` | Trolley / cross-travel left |
| `coil.trolleyRight` | coil | `3` | `23` | Trolley right |
| `coil.deadman` | coil | `10` | `30` | Deadman / enable coil the HMI pulses while holding motion |
| `coil.eStop` | coil | `11` | `31` | Software e-stop latch coil the HMI writes (still require hardwired e-stop) |
| `holding.hoistHeightMm` | holding | `0` | `100` | Holding / analog register for height in mm (or scaled engineering units) |
| `holding.loadKg` | holding | `1` | `101` | Load / weight holding |
| `holding.speedPct` | holding | `2` | `102` | Optional speed % |
| `holding.heartbeat` | holding | `10` | `110` | Watchdog: API refreshes this ~every poll; PLC should stop motion if the value goes stale (recommend **>2 s** without change) |
| `holding.safeState` | holding | `11` | `111` | Register written on comms-lost / safe-state |
| `discrete.motorRunning` | discrete | `0` | `5` | Discrete / digital input: motor running feedback |
| `discrete.fault` | discrete | `1` | `6` | Fault feedback (if used) |
| `discrete.commsOk` | discrete | `2` | `7` | Optional plant “comms ok” bit |

For each row: set **Address** → **Save**. Success: **Saved** plus that name.

**Cells** already point at these names (Hoist Up → `coil.hoistUp`, STOP → `coil.eStop`, …). You normally do **not** rewire cells after addresses are correct.

---

## Step-by-step (Modbus TCP)

1. **Confirm network**  
   Run the API on a computer on the factory Wi-Fi (a local dev server on that Wi-Fi is enough). From **that** computer, ping the PLC IP. Open TCP `502` if a firewall sits between them. The hosted site abroad cannot ping a private factory address.

2. **Sign in as admin** → open **Config** (`/admin`).

3. **Leave demo-simulator alone** for now (or uncheck **Use this PLC** on it).

4. Under **Add a PLC**, enter:
   - Label: `bay-a-plc`
   - Host: PLC IP (example `192.168.10.50`)
   - Port: `502`
   - Unit id: from PLC (example `1`)
   - Protocol: **Modbus TCP**
   - **Use this PLC**: checked  
   Click **Add PLC**.

5. Open **Ops**. Expect **PLC connected: true** and your label.  
   If connection fails: wrong host/port/unit, firewall, or PLC Modbus server disabled. Fix and **Save** again.

6. Open **Config → Register maps**. For every row that your plant uses, put the **real** Modbus or OPC address and click **Save**.  
   Pendant: start with `coil.p03a21.di.*` (both sides of each rocker) and `coil.p03a21.di.enable`, then the lamp coils `coil.p03a21.do.*`, plus `coil.deadman`, `coil.eStop`, `holding.heartbeat`, and `holding.safeState`.  
   Crane screen: motion coils + height/load/feedback.

7. Open **Operator**. With the machine in a safe state and permission to move:
   - **demo-p03a21**: **OWFF** toggles one side; jog rockers move only while **Enable** is held.
   - **demo-crane**: banners / height tags update; hold **Hoist Up** only when allowed.
   - **STOP** is one press and latches software e-stop. **Reset e-stop** asks for `SAFE_ACTION_PIN`. It does not replace the hardwired e-stop.

8. **Hardwired e-stop** on the real crane clears when the safety system resets (mushroom out + machine reset). Docker restart only clears the **simulator**.

9. To return to the fake crane: check **Use this PLC** on **demo-simulator** → **Save**.

---

## Checklist before first real move

- [ ] The API is running on the factory Wi-Fi, and the phone opens that computer, not the public site.
- [ ] Controls engineer signed off the address list (Modbus/OPC numbers, not raw `I200.x` / `Q200.x` names; 0-based vs 1-based confirmed).
- [ ] Ops shows connected to the **real** label, not only demo-simulator.
- [ ] Each P03A21 rocker has **two** real coil numbers saved (`coil.p03a21.di.*` pairs).
- [ ] Heartbeat / safe-state registers exist in the PLC program if you rely on them.
- [ ] Hardwired e-stop tested independently of the HMI.
- [ ] SAFE_ACTION_PIN known only to authorized operators.
- [ ] Face login never used for e-stop or safe actions.

---

## OPC UA (optional)

If **Protocol** is **OPC UA**:

| Field | Example | Where to get it |
| ----- | ------- | --------------- |
| Host | `192.168.10.50` | OPC UA server endpoint host |
| Port | `4840` | Common OPC UA port (confirm in server config) |
| Unit id | `1` | Often unused for OPC UA; keep `1` unless your build documents otherwise |
| Each register **Node id** | `ns=2;s=Hoist.HeightMm` | From OPC UA address space / UA Expert / PLC tag export |

Fill **Node id** on each register row (Config shows that field when an OPC UA connection exists), then **Save**. See [DRIVERS.md](./DRIVERS.md).

---

## Related docs

- [DRIVERS.md](./DRIVERS.md); Modbus / OPC UA / adding drivers  
- [INSTALLATION.md](./INSTALLATION.md); deploy, ports, TLS  
- [USER_MANUAL.md](./USER_MANUAL.md); Config UI walkthrough  
- [MANUAL_TEST_PLAN.md](./MANUAL_TEST_PLAN.md); acceptance clicks (simulator-oriented; adapt for plant)
