import { ModbusConnectionOptions, ModbusDriver } from './driver.interface';

/**
 * In-memory Modbus driver for unit tests and early scaffolding.
 * Real TCP implementation lands in the modbus-sim / driver step.
 */
export class MemoryModbusDriver implements ModbusDriver {
  private connected = false;
  private readonly coils = new Map<number, boolean>();
  private readonly discretes = new Map<number, boolean>();
  private readonly holdings = new Map<number, number>();
  private readonly inputs = new Map<number, number>();

  async connect(_options: ModbusConnectionOptions): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  private assertConnected(): void {
    if (!this.connected) {
      throw new Error('Modbus driver is not connected');
    }
  }

  async readCoils(address: number, length: number): Promise<boolean[]> {
    this.assertConnected();
    return Array.from(
      { length },
      (_, i) => this.coils.get(address + i) ?? false,
    );
  }

  async readDiscreteInputs(
    address: number,
    length: number,
  ): Promise<boolean[]> {
    this.assertConnected();
    return Array.from(
      { length },
      (_, i) => this.discretes.get(address + i) ?? false,
    );
  }

  async readHoldingRegisters(
    address: number,
    length: number,
  ): Promise<number[]> {
    this.assertConnected();
    return Array.from(
      { length },
      (_, i) => this.holdings.get(address + i) ?? 0,
    );
  }

  async readInputRegisters(address: number, length: number): Promise<number[]> {
    this.assertConnected();
    return Array.from({ length }, (_, i) => this.inputs.get(address + i) ?? 0);
  }

  async writeCoil(address: number, value: boolean): Promise<void> {
    this.assertConnected();
    this.coils.set(address, value);
  }

  async writeRegister(address: number, value: number): Promise<void> {
    this.assertConnected();
    this.holdings.set(address, value);
  }

  async writeRegisters(address: number, values: number[]): Promise<void> {
    this.assertConnected();
    values.forEach((value, i) => this.holdings.set(address + i, value));
  }

  /** Test helper: seed input registers (read-only from PLC view). */
  seedInput(address: number, value: number): void {
    this.inputs.set(address, value);
  }

  /** Test helper: seed discrete inputs. */
  seedDiscrete(address: number, value: boolean): void {
    this.discretes.set(address, value);
  }
}
