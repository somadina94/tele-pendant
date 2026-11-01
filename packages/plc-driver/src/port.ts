export type PlcKind = 'coil' | 'discrete' | 'holding' | 'input';

export interface PlcPoint {
  kind: PlcKind;
  address: number;
  nodeId?: string | null;
}

export interface PlcConnectOptions {
  host: string;
  port: number;
  unitId?: number;
  timeoutMs?: number;
}

/** Protocol-neutral read/write. Modbus and OPC UA each adapt to this. */
export interface PlcPort {
  connect(options: PlcConnectOptions): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  read(point: PlcPoint): Promise<number | boolean>;
  write(point: PlcPoint, value: number | boolean): Promise<void>;
}

export interface ModbusShapedDriver {
  connect(options: {
    host: string;
    port: number;
    unitId: number;
    timeoutMs?: number;
  }): Promise<void>;
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
