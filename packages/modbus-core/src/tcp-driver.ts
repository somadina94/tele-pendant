import * as Modbus from 'jsmodbus';
import net from 'net';
import { ModbusConnectionOptions, ModbusDriver } from './driver.interface';

/**
 * Modbus TCP client driver (jsmodbus).
 */
export class TcpModbusDriver implements ModbusDriver {
  private socket: net.Socket | null = null;
  private client: InstanceType<typeof Modbus.client.TCP> | null = null;
  private connected = false;

  async connect(options: ModbusConnectionOptions): Promise<void> {
    if (this.connected) {
      await this.disconnect();
    }

    const socket = new net.Socket();
    const client = new Modbus.client.TCP(socket, options.unitId);
    const timeoutMs = options.timeoutMs ?? 3000;

    await new Promise<void>((resolve, reject) => {
      const onError = (err: Error) => {
        cleanup();
        reject(err);
      };
      const onConnect = () => {
        cleanup();
        this.connected = true;
        resolve();
      };
      const timer = setTimeout(() => {
        cleanup();
        socket.destroy();
        reject(
          new Error(
            `Modbus connect timeout to ${options.host}:${options.port}`,
          ),
        );
      }, timeoutMs);

      const cleanup = () => {
        clearTimeout(timer);
        socket.off('error', onError);
        socket.off('connect', onConnect);
      };

      socket.once('error', onError);
      socket.once('connect', onConnect);
      socket.connect({ host: options.host, port: options.port });
    });

    socket.on('close', () => {
      this.connected = false;
    });
    socket.on('error', () => {
      this.connected = false;
    });

    this.socket = socket;
    this.client = client;
  }

  async disconnect(): Promise<void> {
    const socket = this.socket;
    this.socket = null;
    this.client = null;
    this.connected = false;
    if (!socket) return;
    await new Promise<void>((resolve) => {
      socket.end(() => resolve());
      setTimeout(() => {
        socket.destroy();
        resolve();
      }, 200);
    });
  }

  isConnected(): boolean {
    return this.connected;
  }

  private assertClient(): InstanceType<typeof Modbus.client.TCP> {
    if (!this.client || !this.connected) {
      throw new Error('Modbus driver is not connected');
    }
    return this.client;
  }

  async readCoils(address: number, length: number): Promise<boolean[]> {
    const resp = await this.assertClient().readCoils(address, length);
    return resp.response.body.valuesAsArray.slice(0, length).map(Boolean);
  }

  async readDiscreteInputs(
    address: number,
    length: number,
  ): Promise<boolean[]> {
    const resp = await this.assertClient().readDiscreteInputs(address, length);
    return resp.response.body.valuesAsArray.slice(0, length).map(Boolean);
  }

  async readHoldingRegisters(
    address: number,
    length: number,
  ): Promise<number[]> {
    const resp = await this.assertClient().readHoldingRegisters(
      address,
      length,
    );
    return Array.from(resp.response.body.valuesAsArray.slice(0, length));
  }

  async readInputRegisters(address: number, length: number): Promise<number[]> {
    const resp = await this.assertClient().readInputRegisters(address, length);
    return Array.from(resp.response.body.valuesAsArray.slice(0, length));
  }

  async writeCoil(address: number, value: boolean): Promise<void> {
    await this.assertClient().writeSingleCoil(address, value);
  }

  async writeRegister(address: number, value: number): Promise<void> {
    await this.assertClient().writeSingleRegister(address, value);
  }

  async writeRegisters(address: number, values: number[]): Promise<void> {
    await this.assertClient().writeMultipleRegisters(address, values);
  }
}
