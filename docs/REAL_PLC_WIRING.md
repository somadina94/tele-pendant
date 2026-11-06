# Register a real PLC (step by step)

This guide replaces the demo Modbus simulator with a **real** plant PLC. You work in **Config** (web `/admin`, or Expo **Config**). Software supervision (deadman / e-stop / watchdog) is **not** a SIL/PL certified safety function and does **not** replace a hardwired e-stop or safety PLC.

The fake crane is the **demo-simulator** row (host `modbus-sim` or `127.0.0.1`, port `1502`). Keep that row for lab tests; add a second row for the real machine.

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

Keep the **names** Tele-Pendant already uses (`coil.eStop`, `holding.hoistHeightMm`, …). Change only **Address** (and **Node id** if OPC UA) to match the real program. Names stay stable so Operator cells keep working.

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
| `holding.heartbeat` | holding | `10` | `110` | Register the API writes as a watchdog heartbeat (PLC must monitor it) |
| `holding.safeState` | holding | `11` | `111` | Register written on comms-lost / safe-state |
| `discrete.motorRunning` | discrete | `0` | `5` | Discrete / digital input: motor running feedback |
| `discrete.fault` | discrete | `1` | `6` | Fault feedback (if used) |
| `discrete.commsOk` | discrete | `2` | `7` | Optional plant “comms ok” bit |

For each row: set **Address** → **Save**. Success: **Saved** plus that name.

**Cells** already point at these names (Hoist Up → `coil.hoistUp`, STOP → `coil.eStop`, …). You normally do **not** rewire cells after addresses are correct.

---

## Step-by-step (Modbus TCP)

1. **Confirm network**  
   From the machine that runs the Tele-Pendant API, ping the PLC IP. Open TCP `502` if a firewall sits between them.

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

6. Open **Config → Register maps**. For every row that your plant uses, put the **real** address from the I/O map and click **Save**.  
   Start with motion coils + `coil.deadman` + `coil.eStop` + `holding.heartbeat` + `holding.safeState` + height/load/feedback.

7. Open **Operator**. With the machine in a safe state and permission to move:
   - Confirm banners / height tags update.
   - Hold **Hoist Up** only when allowed; release should drop deadman.
   - **STOP** is one press and latches software e-stop. **Reset e-stop** asks for `SAFE_ACTION_PIN`.

8. **Hardwired e-stop** on the real crane clears when the safety system resets (mushroom out + machine reset). Docker restart only clears the **simulator**.

9. To return to the fake crane: check **Use this PLC** on **demo-simulator** → **Save**.

---

## Checklist before first real move

- [ ] Controls engineer signed off the address list (0-based vs 1-based confirmed).
- [ ] Ops shows connected to the **real** label, not only demo-simulator.
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
