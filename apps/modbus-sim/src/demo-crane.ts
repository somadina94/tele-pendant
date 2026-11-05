import { DEMO_CRANE_MAP } from '@tele-pendant/modbus-core';

/** Allocate Modbus memory buffers for the demo crane. */
export function createDemoCraneBuffers() {
  const coils = Buffer.alloc(64, 0);
  const discrete = Buffer.alloc(64, 0);
  const holding = Buffer.alloc(200);
  const input = Buffer.alloc(200);

  // Initial live values
  holding.writeUInt16BE(1250, DEMO_CRANE_MAP.holdings.hoistHeightMm * 2);
  holding.writeUInt16BE(0, DEMO_CRANE_MAP.holdings.loadKg * 2);
  holding.writeUInt16BE(0, DEMO_CRANE_MAP.holdings.speedPct * 2);
  holding.writeUInt16BE(0, DEMO_CRANE_MAP.holdings.trolleyPosition * 2);
  holding.writeUInt16BE(0, DEMO_CRANE_MAP.holdings.safeState * 2);

  input.writeUInt16BE(0, DEMO_CRANE_MAP.inputs.loadCellRaw * 2);

  return { coils, discrete, holding, input };
}

export { DEMO_CRANE_MAP };
