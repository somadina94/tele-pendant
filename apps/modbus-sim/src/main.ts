import * as Modbus from 'jsmodbus';
import net from 'net';
import { DEMO_P03A21_MAP } from '@tele-pendant/modbus-core';
import { getBit, setBit } from './bits';
import { createDemoCraneBuffers, DEMO_CRANE_MAP } from './demo-crane';

const port = Number(process.env.MODBUS_SIM_PORT ?? 1502);
const host = process.env.MODBUS_SIM_HOST ?? '127.0.0.1';

const buffers = createDemoCraneBuffers();
setBit(buffers.discrete, DEMO_CRANE_MAP.discretes.commsOk, true);

/** Echo pendant DI → DO lamps (illuminated PB / selector feedback). */
const LAMP_ECHO: Array<{ di: number[]; do: number }> = [
  // P01: indicator only (Enable held => buttons active).
  {
    di: [DEMO_P03A21_MAP.di.enable],
    do: DEMO_P03A21_MAP.do.buttonsActive,
  },
  {
    di: [DEMO_P03A21_MAP.di.teachSeamTrackingLaser],
    do: DEMO_P03A21_MAP.do.teachSeamTrackingLaser,
  },
  {
    di: [DEMO_P03A21_MAP.di.teachPipeMiddle],
    do: DEMO_P03A21_MAP.do.teachPipeMiddle,
  },
  {
    di: [DEMO_P03A21_MAP.di.seamTrackingOnOff],
    do: DEMO_P03A21_MAP.do.seamTrackingOnOff,
  },
  {
    di: [DEMO_P03A21_MAP.di.moveWeldingPosition],
    do: DEMO_P03A21_MAP.do.moveWeldingPosition,
  },
  {
    di: [DEMO_P03A21_MAP.di.owcvaDown, DEMO_P03A21_MAP.di.owcvaUp],
    do: DEMO_P03A21_MAP.do.owcvaSelector,
  },
  {
    di: [DEMO_P03A21_MAP.di.moveHomePosition],
    do: DEMO_P03A21_MAP.do.moveHomePosition,
  },
  {
    di: [DEMO_P03A21_MAP.di.owvaUp, DEMO_P03A21_MAP.di.owvaDown],
    do: DEMO_P03A21_MAP.do.owvaSelector,
  },
  {
    di: [DEMO_P03A21_MAP.di.moveWeldingPosition],
    do: DEMO_P03A21_MAP.do.moveWeldingPositionAlt,
  },
  {
    di: [DEMO_P03A21_MAP.di.owhaBack, DEMO_P03A21_MAP.di.owhaFwd],
    do: DEMO_P03A21_MAP.do.owhaSelector,
  },
  {
    di: [DEMO_P03A21_MAP.di.axisFastSlowly],
    do: DEMO_P03A21_MAP.do.axisFastSlowly,
  },
  {
    di: [DEMO_P03A21_MAP.di.owcaBack, DEMO_P03A21_MAP.di.owcaFwd],
    do: DEMO_P03A21_MAP.do.owcaSelector,
  },
  {
    di: [DEMO_P03A21_MAP.di.owwacUp, DEMO_P03A21_MAP.di.owwacDown],
    do: DEMO_P03A21_MAP.do.owwacSelector,
  },
  {
    di: [DEMO_P03A21_MAP.di.owvaHeightReg],
    do: DEMO_P03A21_MAP.do.owvaHeightReg,
  },
  {
    di: [DEMO_P03A21_MAP.di.owwdcUp, DEMO_P03A21_MAP.di.owwdcDown],
    do: DEMO_P03A21_MAP.do.owwdcSelector,
  },
  {
    di: [DEMO_P03A21_MAP.di.teachWeldingPosition],
    do: DEMO_P03A21_MAP.do.teachWeldingPosition,
  },
  {
    di: [DEMO_P03A21_MAP.di.owffClose, DEMO_P03A21_MAP.di.owffOpen],
    do: DEMO_P03A21_MAP.do.owffSelector,
  },
];

const netServer = new net.Server();
new Modbus.server.TCP(netServer, {
  coils: buffers.coils,
  discrete: buffers.discrete,
  holding: buffers.holding,
  input: buffers.input,
});

/** TP-46: keep the sim alive when a client socket errors or drops. */
function attachClientGuards(socket: net.Socket): void {
  socket.on('error', (err) => {
    console.warn(
      `[modbus-sim] client error ${socket.remoteAddress ?? '?'}: ${err.message}`,
    );
  });
  socket.on('close', (hadError) => {
    console.log(
      `[modbus-sim] client closed ${socket.remoteAddress ?? '?'}${hadError ? ' (had error)' : ''}`,
    );
  });
}

netServer.on('connection', (socket) => {
  attachClientGuards(socket);
});

netServer.on('error', (err) => {
  console.error(`[modbus-sim] server error: ${err.message}`);
});

process.on('uncaughtException', (err) => {
  console.error(`[modbus-sim] uncaughtException (kept alive): ${err.message}`);
});

process.on('unhandledRejection', (reason) => {
  console.error(
    `[modbus-sim] unhandledRejection (kept alive): ${String(reason)}`,
  );
});

setInterval(() => {
  const eStop = getBit(buffers.coils, DEMO_CRANE_MAP.coils.eStop);
  const deadman = getBit(buffers.coils, DEMO_CRANE_MAP.coils.deadman);
  const up = getBit(buffers.coils, DEMO_CRANE_MAP.coils.hoistUp);
  const down = getBit(buffers.coils, DEMO_CRANE_MAP.coils.hoistDown);
  const left = getBit(buffers.coils, DEMO_CRANE_MAP.coils.trolleyLeft);
  const right = getBit(buffers.coils, DEMO_CRANE_MAP.coils.trolleyRight);

  // P03A21 lamp echo (independent of crane motion).
  for (const echo of LAMP_ECHO) {
    const lit = echo.di.some((addr) => getBit(buffers.coils, addr));
    setBit(buffers.coils, echo.do, lit);
  }

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
    // Clear pendant jog DIs on e-stop.
    for (const addr of Object.values(DEMO_P03A21_MAP.di) as number[]) {
      if (addr === DEMO_P03A21_MAP.di.enable) continue;
      setBit(buffers.coils, addr, false);
    }
    setBit(buffers.discrete, DEMO_CRANE_MAP.discretes.motorRunning, false);
    buffers.holding.writeUInt16BE(1, DEMO_CRANE_MAP.holdings.safeState * 2);
    return;
  }

  const canMove = deadman;
  /** FEAT-A2: API owns holding.speedPct; scale jog step from commanded % (fallback 70). */
  const commandedSpeed = buffers.holding.readUInt16BE(
    DEMO_CRANE_MAP.holdings.speedPct * 2,
  );
  const effectivePct =
    commandedSpeed > 0 ? Math.min(100, commandedSpeed) : canMove ? 70 : 0;
  const step = Math.max(1, Math.round((effectivePct / 100) * 35));
  if (canMove && up) {
    height = Math.min(5000, height + step);
    setBit(buffers.discrete, DEMO_CRANE_MAP.discretes.motorRunning, true);
  } else if (canMove && down) {
    height = Math.max(0, height - step);
    setBit(buffers.discrete, DEMO_CRANE_MAP.discretes.motorRunning, true);
  } else if (canMove && (left || right)) {
    setBit(buffers.discrete, DEMO_CRANE_MAP.discretes.motorRunning, true);
    travel = left ? Math.max(0, travel - step) : Math.min(5000, travel + step);
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
  console.log(`[modbus-sim] demo crane + P03A21 pendant on ${host}:${port}`);
  console.log(
    `[modbus-sim] hoistUp coil=${DEMO_CRANE_MAP.coils.hoistUp}, height holding=${DEMO_CRANE_MAP.holdings.hoistHeightMm}`,
  );
  console.log(
    `[modbus-sim] P03A21 enable DI=${DEMO_P03A21_MAP.di.enable}, eStop=${DEMO_P03A21_MAP.safety.eStop}`,
  );
});

process.on('SIGINT', () => {
  netServer.close();
  process.exit(0);
});
