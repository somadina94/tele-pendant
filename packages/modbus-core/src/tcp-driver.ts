import * as Modbus from 'jsmodbus';
import net from 'net';
import { ModbusConnectionOptions, ModbusDriver } from './driver.interface';

/**
 * Modbus TCP client driver (jsmodbus).
 *
 * TP-41: each connect/disconnect bumps `generation` so a superseded socket's
 * delayed `close`/`error` cannot clear `connected` on the active session.
 */
export class TcpModbusDriver implements ModbusDriver {
  private socket: net.Socket | null = null;
  private client: InstanceType<typeof Modbus.client.TCP> | null = null;
  private connected = false;
  private generation = 0;

  async connect(options: ModbusConnectionOptions): Promise<void> {
    await this.disconnect();
    const generation = ++this.generation;

    const socket = new net.Socket();
    const client = new Modbus.client.TCP(socket, options.unitId);
    const timeoutMs = options.timeoutMs ?? 3000;

    try {
      await new Promise<void>((resolve, reject) => {
        const onError = (err: Error) => {
          cleanup();
          reject(err);
        };
        const onConnect = () => {
          cleanup();
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
    } catch (err) {
      if (this.generation === generation) {
        this.connected = false;
        this.socket = null;
        this.client = null;
      }
      socket.destroy();
      throw err;
    }

    if (this.generation !== generation) {
      socket.destroy();
      throw new Error('Modbus connect superseded');
    }

    socket.on('close', () => {
      if (this.generation !== generation || this.socket !== socket) return;
      this.connected = false;
    });
    socket.on('error', () => {
      if (this.generation !== generation || this.socket !== socket) return;
      this.connected = false;
    });

    this.socket = socket;
    this.client = client;
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.generation += 1;
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
