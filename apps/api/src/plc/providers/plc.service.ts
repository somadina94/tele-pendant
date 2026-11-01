import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import type { ModbusDriver } from '@tele-pendant/modbus-core';
import { TcpModbusDriver } from '@tele-pendant/modbus-core';
import { OpcUaPort } from '@tele-pendant/plc-driver';
import { Repository } from 'typeorm';
import { RegisterMap } from '../../registers/entities/register-map.entity';
import { PlcConnection } from '../entities/plc-connection.entity';

export interface PlcHealth {
  connected: boolean;
  connectionId: string | null;
  label: string | null;
  host: string | null;
  port: number | null;
  lastError: string | null;
}

@Injectable()
export class PlcService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PlcService.name);
  private readonly driver = new TcpModbusDriver();
  private readonly opc = new OpcUaPort();
  private activeProtocol: 'modbus-tcp' | 'opcua' = 'modbus-tcp';
  private active: PlcConnection | null = null;
  private lastConnectionId: string | null = null;
  private lastError: string | null = null;
  private reconnecting: Promise<void> | null = null;
  private addressCacheAt = 0;
  private addressCache = new Map<string, number>();

  constructor(
    @InjectRepository(PlcConnection)
    private readonly connections: Repository<PlcConnection>,
    @InjectRepository(RegisterMap)
    private readonly registers: Repository<RegisterMap>,
    @Inject(ConfigService) private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureSimulatorConnection();
    const enabled = await this.connections.findOne({
      where: { enabled: true },
      order: { createdAt: 'ASC' },
    });
    if (enabled) {
      try {
        await this.connect(enabled.id);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'connect failed';
        this.logger.warn(`Initial PLC connect failed: ${message}`);
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.getDriver().disconnect();
  }

  private async ensureSimulatorConnection(): Promise<void> {
    const host =
      this.configService.get<string>('appConfig.modbus.host') ?? '127.0.0.1';
    const port =
      this.configService.get<number>('appConfig.modbus.port') ?? 1502;
    const unitId =
      this.configService.get<number>('appConfig.modbus.unitId') ?? 1;

    const existing = await this.connections.findOne({
      where: { label: 'demo-simulator' },
    });
    if (existing) return;

    await this.connections.save(
      this.connections.create({
        label: 'demo-simulator',
        host,
        port,
        unitId,
        pollMs: 250,
        enabled: true,
        isSimulator: true,
        protocol: 'modbus-tcp',
      }),
    );
  }

  getDriver(): ModbusDriver {
    if (this.activeProtocol === 'opcua') return this.opc.asModbus();
    return this.driver;
  }

  health(): PlcHealth {
    return {
      connected: this.getDriver().isConnected(),
      connectionId: this.active?.id ?? null,
      label: this.active?.label ?? null,
      host: this.active?.host ?? null,
      port: this.active?.port ?? null,
      lastError: this.lastError,
    };
  }

  async list(): Promise<PlcConnection[]> {
    return this.connections.find({ order: { createdAt: 'ASC' } });
  }

  async saveConnection(input: {
    id?: string;
    label: string;
    host: string;
    port: number;
    unitId: number;
    enabled: boolean;
    protocol?: 'modbus-tcp' | 'opcua';
  }): Promise<PlcConnection> {
    const label = input.label.trim();
    const host = input.host.trim();
    if (!label || !host) {
      throw new BadRequestException('Label and host are required');
    }
    if (input.port < 1 || input.port > 65535) {
      throw new BadRequestException('Port must be from 1 to 65535');
    }
    if (input.unitId < 0 || input.unitId > 255) {
      throw new BadRequestException('Unit id must be from 0 to 255');
    }

    let row: PlcConnection;
    if (input.id) {
      const existing = await this.connections.findOneBy({ id: input.id });
      if (!existing) throw new NotFoundException('PLC connection not found');
      row = existing;
    } else {
      row = this.connections.create({
        isSimulator: false,
        pollMs: 250,
      });
    }

    const duplicate = await this.connections.findOne({ where: { label } });
    if (duplicate && duplicate.id !== row.id) {
      throw new ConflictException(
        'A PLC connection with that label already exists',
      );
    }

    row.label = label;
    row.host = host;
    row.port = input.port;
    row.unitId = input.unitId;
    row.enabled = input.enabled;
    row.protocol = input.protocol === 'opcua' ? 'opcua' : 'modbus-tcp';
    const saved = await this.connections.save(row);

    if (input.enabled) {
      const all = await this.connections.find();
      for (const other of all) {
        other.enabled = other.id === saved.id;
      }
      await this.connections.save(all);
      try {
        await this.connect(saved.id);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'connect failed';
        throw new BadRequestException(
          `Saved ${label}, but the PLC did not connect: ${message}`,
        );
      }
    } else if (this.active?.id === saved.id) {
      await this.getDriver().disconnect();
      this.activeProtocol = 'modbus-tcp';
      this.active = null;
      this.lastConnectionId = null;
    }

    const fresh = await this.connections.findOneBy({ id: saved.id });
    return fresh ?? saved;
  }

  forgetAddresses(): void {
    this.addressCacheAt = 0;
  }

  async addressFor(name: string, fallback: number): Promise<number> {
    if (this.addressCacheAt === 0 || Date.now() - this.addressCacheAt > 1000) {
      const rows = await this.registers.find();
      this.addressCache = new Map(rows.map((row) => [row.name, row.address]));
      this.addressCacheAt = Date.now();
    }
    return this.addressCache.get(name) ?? fallback;
  }

  /** Latest number or bool for every saved register name. */
  async readNamedValues(): Promise<Record<string, number | boolean>> {
    const driver = this.getDriver();
    if (!driver.isConnected()) return {};
    const rows = await this.registers.find();
    const values: Record<string, number | boolean> = {};
    for (const row of rows) {
      try {
        values[row.name] = await this.readOne(row);
      } catch {
        // A bad address must not drop the rest of the live tags.
      }
    }
    return values;
  }

  async trendedSamples(): Promise<Array<{ key: string; value: number }>> {
    const rows = await this.registers.find();
    const values = await this.readNamedValues();
    const samples: Array<{ key: string; value: number }> = [];
    for (const row of rows) {
      if (!row.trended) continue;
      const value = values[row.name];
      if (typeof value === 'number') samples.push({ key: row.name, value });
    }
    return samples;
  }

  private async readOne(row: RegisterMap): Promise<number | boolean> {
    const driver = this.getDriver();
    if (row.kind === 'coil') {
      const [value] = await driver.readCoils(row.address, 1);
      return Boolean(value);
    }
    if (row.kind === 'discrete') {
      const [value] = await driver.readDiscreteInputs(row.address, 1);
      return Boolean(value);
    }
    if (row.kind === 'input') {
      const [value] = await driver.readInputRegisters(row.address, 1);
      return value ?? 0;
    }
    const [value] = await driver.readHoldingRegisters(row.address, 1);
    return value ?? 0;
  }

  async connect(id: string): Promise<PlcHealth> {
    const connection = await this.connections.findOneByOrFail({ id });
    await this.getDriver().disconnect();
    this.activeProtocol = 'modbus-tcp';
    try {
      if (connection.protocol === 'opcua') {
        const rows = await this.registers.find();
        this.opc.setPoints(
          rows.map((row) => ({
            kind: row.kind,
            address: row.address,
            nodeId: row.nodeId ?? null,
          })),
        );
        await this.opc.connect({
          host: connection.host,
          port: connection.port,
        });
        this.activeProtocol = 'opcua';
      } else {
        await this.driver.connect({
          host: connection.host,
          port: connection.port,
          unitId: connection.unitId,
          timeoutMs: 3000,
        });
      }
      this.active = connection;
      this.lastConnectionId = connection.id;
      this.lastError = null;
      const all = await this.connections.find();
      for (const row of all) {
        row.enabled = row.id === id;
      }
      await this.connections.save(all);
    } catch (err) {
      this.activeProtocol = 'modbus-tcp';
      this.active = null;
      this.lastError = err instanceof Error ? err.message : 'connect failed';
      throw err;
    }
    return this.health();
  }

  /**
   * The TCP client does not reconnect after the simulator restarts.
   * The poller calls this whenever the socket is down.
   */
  async reconnectIfNeeded(): Promise<void> {
    if (this.getDriver().isConnected()) return;
    if (!this.reconnecting) {
      this.reconnecting = this.tryReconnect().finally(() => {
        this.reconnecting = null;
      });
    }
    await this.reconnecting;
  }

  private async tryReconnect(): Promise<void> {
    try {
      let id = this.lastConnectionId ?? this.active?.id ?? null;
      if (!id) {
        const enabled = await this.connections.findOne({
          where: { enabled: true },
          order: { createdAt: 'ASC' },
        });
        id = enabled?.id ?? null;
      }
      if (!id) return;
      await this.connect(id);
      this.logger.log('PLC reconnected');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'reconnect failed';
      this.logger.warn(`PLC reconnect failed: ${message}`);
    }
  }

  async readHolding(address: number, length = 1): Promise<number[]> {
    return this.getDriver().readHoldingRegisters(address, length);
  }

  async writeCoil(address: number, value: boolean): Promise<void> {
    await this.getDriver().writeCoil(address, value);
  }

  async writeHolding(address: number, value: number): Promise<void> {
    await this.getDriver().writeRegister(address, value);
  }
}
