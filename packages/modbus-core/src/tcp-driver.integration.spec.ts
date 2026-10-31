import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { TcpModbusDriver } from './tcp-driver';
import { DEMO_CRANE_MAP } from './crane-map';

const SIM_PORT = 1503;

function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

describe('TcpModbusDriver integration', () => {
  let sim: ChildProcess | null = null;
  const driver = new TcpModbusDriver();

  beforeAll(async () => {
    const simEntry = path.resolve(
      __dirname,
      '../../../apps/modbus-sim/src/main.ts',
    );
    sim = spawn('pnpm', ['exec', 'tsx', simEntry], {
      cwd: path.resolve(__dirname, '../../../apps/modbus-sim'),
      env: { ...process.env, MODBUS_SIM_PORT: String(SIM_PORT) },
      stdio: 'pipe',
    });
    await wait(1500);
  }, 20000);

  afterAll(async () => {
    await driver.disconnect();
    if (sim && !sim.killed) {
      sim.kill('SIGTERM');
    }
  });

  it('reads and writes demo crane registers over TCP', async () => {
    await driver.connect({
      host: '127.0.0.1',
      port: SIM_PORT,
      unitId: 1,
      timeoutMs: 5000,
    });

    const heightBefore = await driver.readHoldingRegisters(
      DEMO_CRANE_MAP.holdings.hoistHeightMm,
      1,
    );
    expect(heightBefore[0]).toBeGreaterThanOrEqual(0);

    await driver.writeCoil(DEMO_CRANE_MAP.coils.deadman, true);
    await driver.writeCoil(DEMO_CRANE_MAP.coils.hoistUp, true);
    await wait(500);
    const heightAfter = await driver.readHoldingRegisters(
      DEMO_CRANE_MAP.holdings.hoistHeightMm,
      1,
    );
    expect(heightAfter[0]).toBeGreaterThan(heightBefore[0]!);

    await driver.writeCoil(DEMO_CRANE_MAP.coils.hoistUp, false);
    await driver.writeCoil(DEMO_CRANE_MAP.coils.deadman, false);
  }, 20000);
});
