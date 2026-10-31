export type ModbusRegisterKind = 'coil' | 'discrete' | 'holding' | 'input';

export interface ModbusConnectionOptions {
  host: string;
  port: number;
  unitId: number;
  timeoutMs?: number;
}

export interface ModbusDriver {
  connect(options: ModbusConnectionOptions): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  readCoils(address: number, length: number): Promise<boolean[]>;
  readDiscreteInputs(address: number, length: number): Promise<boolean[]>;
  readHoldingRegisters(address: number, length: number): Promise<number[]>;
  readInputRegisters(address: number, length: number): Promise<number[]>;
  writeCoil(address: number, value: boolean): Promise<void>;
  writeRegister(address: number, value: number): Promise<void>;
  writeRegisters(address: number, values: number[]): Promise<void>;
}
