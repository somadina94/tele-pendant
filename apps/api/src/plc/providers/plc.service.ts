import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { TcpModbusDriver } from '@tele-pendant/modbus-core';
import { Repository } from 'typeorm';
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
  private active: PlcConnection | null = null;
  private lastError: string | null = null;

  constructor(
    @InjectRepository(PlcConnection)
    private readonly connections: Repository<PlcConnection>,
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
    await this.driver.disconnect();
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
      }),
    );
  }

  getDriver(): TcpModbusDriver {
    return this.driver;
  }

  health(): PlcHealth {
    return {
      connected: this.driver.isConnected(),
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

  async connect(id: string): Promise<PlcHealth> {
    const connection = await this.connections.findOneByOrFail({ id });
    await this.driver.disconnect();
    try {
      await this.driver.connect({
        host: connection.host,
        port: connection.port,
        unitId: connection.unitId,
        timeoutMs: 3000,
      });
      this.active = connection;
      this.lastError = null;
      const all = await this.connections.find();
      for (const row of all) {
        row.enabled = row.id === id;
      }
      await this.connections.save(all);
    } catch (err) {
      this.active = null;
      this.lastError = err instanceof Error ? err.message : 'connect failed';
      throw err;
    }
    return this.health();
  }

  async readHolding(address: number, length = 1): Promise<number[]> {
    return this.driver.readHoldingRegisters(address, length);
  }

  async writeCoil(address: number, value: boolean): Promise<void> {
    await this.driver.writeCoil(address, value);
  }

  async writeHolding(address: number, value: number): Promise<void> {
    await this.driver.writeRegister(address, value);
  }
}
