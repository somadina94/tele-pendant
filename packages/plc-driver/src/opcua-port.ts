import type {
  ModbusShapedDriver,
  PlcConnectOptions,
  PlcPoint,
  PlcPort,
} from './port';

export interface OpcSession {
  read(nodeId: string): Promise<unknown>;
  write(nodeId: string, value: boolean | number): Promise<void>;
  close(): Promise<void>;
}

/**
 * OPC UA adapter. No subscription. node-opcua is loaded only when connecting
 * so the Modbus demo does not need the stack at startup.
 */
export class OpcUaPort implements PlcPort {
  private session: OpcSession | null = null;
  private points: PlcPoint[] = [];
  private facade: ModbusShapedDriver | null = null;

  constructor(
    private readonly openSession: (
      endpoint: string,
    ) => Promise<OpcSession> = openNodeOpcuaSession,
  ) {}

  setPoints(points: PlcPoint[]): void {
    this.points = points;
  }

  async connect(options: PlcConnectOptions): Promise<void> {
    await this.disconnect();
    const endpoint = `opc.tcp://${options.host}:${options.port}`;
    this.session = await this.openSession(endpoint);
  }

  async disconnect(): Promise<void> {
    const session = this.session;
    this.session = null;
    if (session) await session.close();
  }

  isConnected(): boolean {
    return this.session !== null;
  }

  async read(point: PlcPoint): Promise<number | boolean> {
    const value = await this.sessionOrThrow().read(this.nodeId(point));
    if (point.kind === 'coil' || point.kind === 'discrete')
      return Boolean(value);
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  }

  async write(point: PlcPoint, value: number | boolean): Promise<void> {
    const payload =
      point.kind === 'coil' || point.kind === 'discrete'
        ? Boolean(value)
        : Number(value);
    await this.sessionOrThrow().write(this.nodeId(point), payload);
  }

  /** Same method names the poller already calls, backed by node ids. */
  asModbus(): ModbusShapedDriver {
    if (this.facade) return this.facade;
    this.facade = {
      connect: async () => undefined,
      disconnect: () => this.disconnect(),
      isConnected: () => this.isConnected(),
      readCoils: (address, length) => this.readFlags('coil', address, length),
      readDiscreteInputs: (address, length) =>
        this.readFlags('discrete', address, length),
      readHoldingRegisters: (address, length) =>
        this.readWords('holding', address, length),
      readInputRegisters: (address, length) =>
        this.readWords('input', address, length),
      writeCoil: async (address, value) => {
        await this.write({ kind: 'coil', address }, value);
      },
      writeRegister: async (address, value) => {
        await this.write({ kind: 'holding', address }, value);
      },
      writeRegisters: async (address, values) => {
        for (let i = 0; i < values.length; i++) {
          await this.write(
            { kind: 'holding', address: address + i },
            values[i],
          );
        }
      },
    };
    return this.facade;
  }

  private async readFlags(
    kind: 'coil' | 'discrete',
    address: number,
    length: number,
  ): Promise<boolean[]> {
    const out: boolean[] = [];
    for (let i = 0; i < length; i++) {
      out.push(Boolean(await this.read({ kind, address: address + i })));
    }
    return out;
  }

  private async readWords(
    kind: 'holding' | 'input',
    address: number,
    length: number,
  ): Promise<number[]> {
    const out: number[] = [];
    for (let i = 0; i < length; i++) {
      out.push(Number(await this.read({ kind, address: address + i })));
    }
    return out;
  }

  private nodeId(point: PlcPoint): string {
    if (point.nodeId) return point.nodeId;
    const hit = this.points.find(
      (row) =>
        row.kind === point.kind && row.address === point.address && row.nodeId,
    );
    if (!hit?.nodeId) {
      throw new Error(`No OPC UA node for ${point.kind} ${point.address}`);
    }
    return hit.nodeId;
  }

  private sessionOrThrow(): OpcSession {
    if (!this.session) throw new Error('OPC UA is not connected');
    return this.session;
  }
}

async function openNodeOpcuaSession(endpoint: string): Promise<OpcSession> {
  const spec = 'node-opcua';
  const opc = (await import(spec)) as {
    OPCUAClient: {
      create: (options: { endpointMustExist: boolean }) => {
        connect: (url: string) => Promise<void>;
        disconnect: () => Promise<void>;
        createSession: () => Promise<{
          read: (req: { nodeId: string; attributeId: number }) => Promise<{
            value?: { value?: unknown };
          }>;
          write: (req: {
            nodeId: string;
            attributeId: number;
            value: { value: { dataType: unknown; value: boolean | number } };
          }) => Promise<void>;
          close: () => Promise<void>;
        }>;
      };
    };
    AttributeIds: { Value: number };
    DataType: { Boolean: unknown; Double: unknown };
  };
  const client = opc.OPCUAClient.create({ endpointMustExist: false });
  await client.connect(endpoint);
  const session = await client.createSession();
  return {
    read: async (nodeId) => {
      const data = await session.read({
        nodeId,
        attributeId: opc.AttributeIds.Value,
      });
      return data.value?.value;
    },
    write: async (nodeId, value) => {
      await session.write({
        nodeId,
        attributeId: opc.AttributeIds.Value,
        value: {
          value: {
            dataType:
              typeof value === 'boolean'
                ? opc.DataType.Boolean
                : opc.DataType.Double,
            value,
          },
        },
      });
    },
    close: async () => {
      await session.close();
      await client.disconnect();
    },
  };
}
