import { MemoryModbusDriver } from './memory-driver';

describe('MemoryModbusDriver', () => {
  let driver: MemoryModbusDriver;

  beforeEach(async () => {
    driver = new MemoryModbusDriver();
    await driver.connect({ host: '127.0.0.1', port: 1502, unitId: 1 });
  });

  afterEach(async () => {
    await driver.disconnect();
  });

  it('reports connection state', async () => {
    expect(driver.isConnected()).toBe(true);
    await driver.disconnect();
    expect(driver.isConnected()).toBe(false);
  });

  it('writes and reads holding registers', async () => {
    await driver.writeRegister(100, 42);
    await expect(driver.readHoldingRegisters(100, 1)).resolves.toEqual([42]);
  });

  it('writes multiple holding registers', async () => {
    await driver.writeRegisters(200, [1, 2, 3]);
    await expect(driver.readHoldingRegisters(200, 3)).resolves.toEqual([
      1, 2, 3,
    ]);
  });

  it('writes and reads coils', async () => {
    await driver.writeCoil(1, true);
    await expect(driver.readCoils(1, 1)).resolves.toEqual([true]);
  });

  it('reads default false coils when unset', async () => {
    await expect(driver.readCoils(50, 2)).resolves.toEqual([false, false]);
  });

  it('throws when not connected', async () => {
    await driver.disconnect();
    await expect(driver.writeCoil(1, true)).rejects.toThrow(
      'Modbus driver is not connected',
    );
  });

  it('seeds and reads input registers', async () => {
    driver.seedInput(10, 7);
    await expect(driver.readInputRegisters(10, 1)).resolves.toEqual([7]);
  });

  it('seeds and reads discrete inputs', async () => {
    driver.seedDiscrete(3, true);
    await expect(driver.readDiscreteInputs(3, 1)).resolves.toEqual([true]);
  });

  it('returns false for unset discretes', async () => {
    await expect(driver.readDiscreteInputs(99, 1)).resolves.toEqual([false]);
  });
});
