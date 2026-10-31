/**
 * Demo crane Modbus map shared by simulator seed and API defaults.
 * Addresses are 0-based.
 */
export const DEMO_CRANE_MAP = {
  coils: {
    hoistUp: 0,
    hoistDown: 1,
    trolleyLeft: 2,
    trolleyRight: 3,
    bridgeFwd: 4,
    bridgeRev: 5,
    deadman: 10,
    eStop: 11,
  },
  holdings: {
    hoistHeightMm: 0,
    loadKg: 1,
    speedPct: 2,
    heartbeat: 10,
    safeState: 11,
  },
  discretes: {
    motorRunning: 0,
    fault: 1,
    commsOk: 2,
  },
  inputs: {
    loadCellRaw: 0,
  },
} as const;
