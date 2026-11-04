# PLC drivers

Tele-Pendant talks to plant hardware through a protocol-neutral port in `@tele-pendant/plc-driver`.

## Contract

`PlcPort` in [`packages/plc-driver/src/port.ts`](../packages/plc-driver/src/port.ts) defines:

- `connect` / `disconnect` / `isConnected`
- `read(point)` / `write(point, value)` for coils, discretes, holdings, and inputs

New fieldbuses implement `PlcPort`. The API (`apps/api/src/plc/providers/plc.service.ts`) selects the active connection and maps HMI register rows onto that port.

## Shipped drivers

| Protocol | Status | Notes |
| -------- | ------ | ----- |
| Modbus TCP | Default | Simulator on port `1502`; Admin **Protocol** = Modbus TCP |
| OPC UA | Optional | Compose profile `opcua`; set connection to OPC UA and fill each register’s node id |

Admin **Config → PLC connections** toggles protocol. Register maps store Modbus address and optional OPC UA node id so the same HMI layout can switch backends.

For connecting a **real** PLC (fields, example values, where to read them on the machine), see [REAL_PLC_WIRING.md](./REAL_PLC_WIRING.md).

## Adding a driver

1. Implement `PlcPort` in `packages/plc-driver` (or a sibling package).
2. Wire construction in `plc.service.ts` next to Modbus / OPC UA.
3. Document host/port/auth env vars here and in `INSTALLATION.md`.
4. Keep safety supervision (deadman / e-stop / watchdog) at the HMI/API layer — do not claim SIL in the driver.

Out of scope for this delivery: Profinet, EtherNet/IP, and other fieldbuses beyond Modbus TCP + OPC UA.
