import * as Modbus from 'jsmodbus';
import net from 'net';
import { getBit, setBit } from './bits';
import { createDemoCraneBuffers, DEMO_CRANE_MAP } from './demo-crane';

const port = Number(process.env.MODBUS_SIM_PORT ?? 1502);
const host = process.env.MODBUS_SIM_HOST ?? '127.0.0.1';

const buffers = createDemoCraneBuffers();
setBit(buffers.discrete, DEMO_CRANE_MAP.discretes.commsOk, true);

const netServer = new net.Server();
new Modbus.server.TCP(netServer, {
  coils: buffers.coils,
  discrete: buffers.discrete,
  holding: buffers.holding,
  input: buffers.input,
});

setInterval(() => {
  const eStop = getBit(buffers.coils, DEMO_CRANE_MAP.coils.eStop);
  const deadman = getBit(buffers.coils, DEMO_CRANE_MAP.coils.deadman);
  const up = getBit(buffers.coils, DEMO_CRANE_MAP.coils.hoistUp);
  const down = getBit(buffers.coils, DEMO_CRANE_MAP.coils.hoistDown);
  const left = getBit(buffers.coils, DEMO_CRANE_MAP.coils.trolleyLeft);
  const right = getBit(buffers.coils, DEMO_CRANE_MAP.coils.trolleyRight);

  let height = buffers.holding.readUInt16BE(
    DEMO_CRANE_MAP.holdings.hoistHeightMm * 2,
  );

  let travel = buffers.holding.readUInt16BE(
    DEMO_CRANE_MAP.holdings.trolleyPosition * 2,
  );

  if (eStop) {
    setBit(buffers.coils, DEMO_CRANE_MAP.coils.hoistUp, false);
    setBit(buffers.coils, DEMO_CRANE_MAP.coils.hoistDown, false);
    setBit(buffers.coils, DEMO_CRANE_MAP.coils.trolleyLeft, false);
    setBit(buffers.coils, DEMO_CRANE_MAP.coils.trolleyRight, false);
    setBit(buffers.discrete, DEMO_CRANE_MAP.discretes.motorRunning, false);
    buffers.holding.writeUInt16BE(1, DEMO_CRANE_MAP.holdings.safeState * 2);
    return;
  }

  const canMove = deadman;
  if (canMove && up) {
    height = Math.min(5000, height + 25);
    setBit(buffers.discrete, DEMO_CRANE_MAP.discretes.motorRunning, true);
  } else if (canMove && down) {
    height = Math.max(0, height - 25);
    setBit(buffers.discrete, DEMO_CRANE_MAP.discretes.motorRunning, true);
  } else if (canMove && (left || right)) {
    setBit(buffers.discrete, DEMO_CRANE_MAP.discretes.motorRunning, true);
    travel = left ? Math.max(0, travel - 10) : Math.min(5000, travel + 10);
  } else {
    setBit(buffers.discrete, DEMO_CRANE_MAP.discretes.motorRunning, false);
  }

  buffers.holding.writeUInt16BE(
    height,
    DEMO_CRANE_MAP.holdings.hoistHeightMm * 2,
  );
  buffers.holding.writeUInt16BE(
    travel,
    DEMO_CRANE_MAP.holdings.trolleyPosition * 2,
  );
}, 200);

netServer.listen(port, host, () => {
  console.log(`[modbus-sim] demo crane listening on ${host}:${port}`);
  console.log(
    `[modbus-sim] hoistUp coil=${DEMO_CRANE_MAP.coils.hoistUp}, height holding=${DEMO_CRANE_MAP.holdings.hoistHeightMm}`,
  );
});

process.on('SIGINT', () => {
  netServer.close();
  process.exit(0);
});
