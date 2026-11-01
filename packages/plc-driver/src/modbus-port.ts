import type {
  ModbusShapedDriver,
  PlcConnectOptions,
  PlcPoint,
  PlcPort,
} from './port';

/** Wraps the existing Modbus TCP driver. The demo crane stays on this path. */
export class ModbusPort implements PlcPort {
  constructor(private readonly driver: ModbusShapedDriver) {}

  connect(options: PlcConnectOptions): Promise<void> {
    return this.driver.connect({
      host: options.host,
      port: options.port,
      unitId: options.unitId ?? 1,
      timeoutMs: options.timeoutMs,
    });
  }

  disconnect(): Promise<void> {
    return this.driver.disconnect();
  }

  isConnected(): boolean {
    return this.driver.isConnected();
  }

  async read(point: PlcPoint): Promise<number | boolean> {
    if (point.kind === 'coil') {
      const [value] = await this.driver.readCoils(point.address, 1);
      return Boolean(value);
    }
    if (point.kind === 'discrete') {
      const [value] = await this.driver.readDiscreteInputs(point.address, 1);
      return Boolean(value);
    }
    if (point.kind === 'input') {
      const [value] = await this.driver.readInputRegisters(point.address, 1);
      return value ?? 0;
    }
    const [value] = await this.driver.readHoldingRegisters(point.address, 1);
    return value ?? 0;
  }

  async write(point: PlcPoint, value: number | boolean): Promise<void> {
    if (point.kind === 'coil' || point.kind === 'discrete') {
      await this.driver.writeCoil(point.address, Boolean(value));
      return;
    }
    await this.driver.writeRegister(point.address, Number(value));
  }
}
