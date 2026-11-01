import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DEMO_CRANE_MAP } from '@tele-pendant/modbus-core';
import { Repository } from 'typeorm';
import { PlcService } from '../../plc/providers/plc.service';
import { RegisterMap } from '../../registers/entities/register-map.entity';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { AlarmDefinition } from '../entities/alarm-definition.entity';
import { AlarmEvent } from '../entities/alarm-event.entity';

@Injectable()
export class AlarmEngineService implements OnModuleInit {
  private readonly logger = new Logger(AlarmEngineService.name);
  private activeByDef = new Map<string, string>();
  private readonly definitions: Repository<AlarmDefinition>;
  private readonly events: Repository<AlarmEvent>;
  private readonly registers: Repository<RegisterMap>;
  private readonly plcService: PlcService;
  private readonly gateway: RealtimeGateway;

  constructor(
    @InjectRepository(AlarmDefinition)
    definitions: Repository<AlarmDefinition>,
    @InjectRepository(AlarmEvent)
    events: Repository<AlarmEvent>,
    @InjectRepository(RegisterMap)
    registers: Repository<RegisterMap>,
    @Inject(PlcService) plcService: PlcService,
    @Inject(RealtimeGateway) gateway: RealtimeGateway,
  ) {
    this.definitions = definitions;
    this.events = events;
    this.registers = registers;
    this.plcService = plcService;
    this.gateway = gateway;
  }

  async onModuleInit(): Promise<void> {
    await this.seedDefaults();
  }

  private async seedDefaults(): Promise<void> {
    if ((await this.definitions.count()) > 0) return;
    const fault = await this.registers.findOne({
      where: { name: 'discrete.motorRunning' },
    });
    // Use e-stop coil as alarm source if present
    let eStop = await this.registers.findOne({ where: { name: 'coil.eStop' } });
    if (!eStop) {
      eStop = await this.registers.save(
        this.registers.create({
          name: 'coil.eStop',
          address: DEMO_CRANE_MAP.coils.eStop,
          kind: 'coil',
          dataType: 'bool',
          rw: 'rw',
        }),
      );
    }
    await this.definitions.save(
      this.definitions.create({
        name: 'E-Stop asserted',
        severity: 'critical',
        compareOp: 'eq',
        threshold: 1,
        enabled: true,
        register: eStop,
      }),
    );
    if (fault) {
      await this.definitions.save(
        this.definitions.create({
          name: 'Motor running feedback',
          severity: 'info',
          compareOp: 'eq',
          threshold: 0,
          enabled: false,
          register: fault,
        }),
      );
    }
  }

  async listActive() {
    return this.events.find({
      where: [{ state: 'active' }, { state: 'acked' }, { state: 'shelved' }],
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  async ack(id: string) {
    const event = await this.events.findOneByOrFail({ id });
    event.state = 'acked';
    event.ackedAt = new Date();
    return this.events.save(event);
  }

  async shelve(id: string) {
    const event = await this.events.findOneByOrFail({ id });
    event.state = 'shelved';
    return this.events.save(event);
  }

  async evaluate(): Promise<void> {
    const driver = this.plcService.getDriver();
    if (!driver.isConnected()) return;

    const defs = await this.definitions.find({ where: { enabled: true } });
    for (const def of defs) {
      const value = await this.readRegisterValue(def.register);
      const tripped = this.compare(value, def.compareOp, def.threshold);
      const existingId = this.activeByDef.get(def.id);

      if (tripped && !existingId) {
        const event = await this.events.save(
          this.events.create({
            definition: def,
            value,
            state: 'active',
          }),
        );
        this.activeByDef.set(def.id, event.id);
        this.gateway.broadcast('alarm.event', event);
        this.logger.warn(`Alarm active: ${def.name} value=${value}`);
      } else if (!tripped && existingId) {
        const event = await this.events.findOne({ where: { id: existingId } });
        if (event && event.state !== 'shelved') {
          event.state = 'cleared';
          await this.events.save(event);
          this.gateway.broadcast('alarm.event', event);
        }
        this.activeByDef.delete(def.id);
      }
    }
  }

  private compare(
    value: number,
    op: AlarmDefinition['compareOp'],
    threshold: number,
  ): boolean {
    switch (op) {
      case 'gt':
        return value > threshold;
      case 'lt':
        return value < threshold;
      case 'neq':
        return value !== threshold;
      case 'eq':
      default:
        return value === threshold;
    }
  }

  private async readRegisterValue(reg: RegisterMap): Promise<number> {
    const driver = this.plcService.getDriver();
    if (reg.kind === 'coil') {
      const v = await driver.readCoils(reg.address, 1);
      return v[0] ? 1 : 0;
    }
    if (reg.kind === 'discrete') {
      const v = await driver.readDiscreteInputs(reg.address, 1);
      return v[0] ? 1 : 0;
    }
    if (reg.kind === 'holding') {
      const v = await driver.readHoldingRegisters(reg.address, 1);
      return v[0] ?? 0;
    }
    const v = await driver.readInputRegisters(reg.address, 1);
    return v[0] ?? 0;
  }

  async listDefinitions() {
    return this.definitions.find({ order: { name: 'ASC' } });
  }

  async createDefinition(input: {
    name: string;
    registerId: string;
    compareOp?: AlarmDefinition['compareOp'];
    threshold?: number;
    severity?: string;
    enabled?: boolean;
  }) {
    const name = input.name.trim();
    if (!name) throw new BadRequestException('Name is required');
    const compareOp = input.compareOp ?? 'eq';
    if (!['eq', 'gt', 'lt', 'neq'].includes(compareOp)) {
      throw new BadRequestException('Operator must be eq, gt, lt, or neq');
    }
    const register = await this.registers.findOneBy({ id: input.registerId });
    if (!register) throw new NotFoundException('Register not found');
    return this.definitions.save(
      this.definitions.create({
        name,
        severity: input.severity?.trim() || 'warning',
        compareOp,
        threshold: Number.isFinite(input.threshold)
          ? Number(input.threshold)
          : 1,
        enabled: input.enabled !== false,
        register,
      }),
    );
  }

  async updateDefinition(
    id: string,
    input: {
      name?: string;
      registerId?: string;
      compareOp?: AlarmDefinition['compareOp'];
      threshold?: number;
      severity?: string;
      enabled?: boolean;
    },
  ) {
    const row = await this.definitions.findOneBy({ id });
    if (!row) throw new NotFoundException('Alarm definition not found');
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) throw new BadRequestException('Name is required');
      row.name = name;
    }
    if (input.severity !== undefined) {
      row.severity = input.severity.trim() || 'warning';
    }
    if (input.compareOp !== undefined) {
      if (!['eq', 'gt', 'lt', 'neq'].includes(input.compareOp)) {
        throw new BadRequestException('Operator must be eq, gt, lt, or neq');
      }
      row.compareOp = input.compareOp;
    }
    if (input.threshold !== undefined) {
      const threshold = Number(input.threshold);
      if (Number.isFinite(threshold)) row.threshold = threshold;
    }
    if (input.enabled !== undefined) row.enabled = input.enabled;
    if (input.registerId !== undefined) {
      const register = await this.registers.findOneBy({ id: input.registerId });
      if (!register) throw new NotFoundException('Register not found');
      row.register = register;
    }
    return this.definitions.save(row);
  }

  async deleteDefinition(id: string) {
    const row = await this.definitions.findOneBy({ id });
    if (!row) throw new NotFoundException('Alarm definition not found');
    await this.definitions.remove(row);
    this.activeByDef.delete(id);
    return { ok: true as const };
  }
}
