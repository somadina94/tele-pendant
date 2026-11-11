import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DEMO_CRANE_MAP } from '@tele-pendant/modbus-core';
import {
  type AlarmSeverity,
  tryParseAlarmSeverity,
} from '@tele-pendant/shared';
import { Repository } from 'typeorm';
import { AuditActor, auditWriteFields } from '../../common/audit-actor';
import { AuditService } from '../../audit/providers/audit.service';
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
  private readonly auditService: AuditService;

  constructor(
    @InjectRepository(AlarmDefinition)
    definitions: Repository<AlarmDefinition>,
    @InjectRepository(AlarmEvent)
    events: Repository<AlarmEvent>,
    @InjectRepository(RegisterMap)
    registers: Repository<RegisterMap>,
    @Inject(PlcService) plcService: PlcService,
    @Inject(RealtimeGateway) gateway: RealtimeGateway,
    @Inject(AuditService) auditService: AuditService,
  ) {
    this.definitions = definitions;
    this.events = events;
    this.registers = registers;
    this.plcService = plcService;
    this.gateway = gateway;
    this.auditService = auditService;
  }

  async onModuleInit(): Promise<void> {
    await this.seedDefaults();
    await this.reloadOpenEvents();
  }

  /**
   * TP-09: open/shelved events live in SQLite, but evaluate() only tracks them
   * in `activeByDef`. Reload that map on boot so recovered conditions still clear
   * after an API restart (and we do not raise duplicates).
   */
  private async reloadOpenEvents(): Promise<void> {
    const open = await this.events.find({
      where: [{ state: 'active' }, { state: 'acked' }, { state: 'shelved' }],
      order: { createdAt: 'DESC' },
    });
    this.activeByDef.clear();
    for (const event of open) {
      const defId = event.definition?.id;
      if (!defId || this.activeByDef.has(defId)) continue;
      this.activeByDef.set(defId, event.id);
    }
    if (this.activeByDef.size > 0) {
      this.logger.log(
        `Reloaded ${this.activeByDef.size} open alarm(s) into the engine`,
      );
    }
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

  /** TP-10: Audit Resource must be the definition name, not the event UUID. */
  private alarmAuditResource(event: AlarmEvent): string {
    const name = event.definition?.name?.trim();
    return name && name.length > 0 ? name : event.id;
  }

  /** TP-21: reject free-text severity; audit the denied write. */
  private async resolveWritableSeverity(
    severity: string | undefined,
    deniedAction: 'alarm.create_denied' | 'alarm.update_denied',
    resource: string,
    actor?: AuditActor,
  ): Promise<AlarmSeverity> {
    const parsed = tryParseAlarmSeverity(severity);
    if (!parsed.ok) {
      await this.auditService.write({
        ...auditWriteFields(actor),
        action: deniedAction,
        resource,
        details: `invalid severity=${parsed.raw}`,
        result: 'failure',
      });
      throw new BadRequestException(
        'Severity must be info, warning, or critical',
      );
    }
    return parsed.value;
  }

  private definitionAuditDetails(row: AlarmDefinition): string {
    return `severity=${row.severity};op=${row.compareOp};threshold=${row.threshold};enabled=${row.enabled}`;
  }

  async ack(id: string, actor?: AuditActor) {
    const event = await this.events.findOneByOrFail({ id });
    event.state = 'acked';
    event.ackedAt = new Date();
    const saved = await this.events.save(event);
    await this.auditService.write({
      ...auditWriteFields(actor),
      action: 'alarm.ack',
      resource: this.alarmAuditResource(event),
      result: 'success',
    });
    return saved;
  }

  async shelve(id: string, actor?: AuditActor) {
    const event = await this.events.findOneByOrFail({ id });
    event.state = 'shelved';
    const saved = await this.events.save(event);
    await this.auditService.write({
      ...auditWriteFields(actor),
      action: 'alarm.shelve',
      resource: this.alarmAuditResource(event),
      result: 'success',
    });
    return saved;
  }

  async unshelve(id: string, actor?: AuditActor) {
    const event = await this.events.findOneByOrFail({ id });
    if (event.state !== 'shelved') {
      throw new BadRequestException('Alarm is not shelved');
    }
    event.state = 'active';
    const saved = await this.events.save(event);
    this.activeByDef.set(event.definition?.id ?? '', event.id);
    await this.auditService.write({
      ...auditWriteFields(actor),
      action: 'alarm.unshelve',
      resource: this.alarmAuditResource(event),
      result: 'success',
    });
    return saved;
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
        if (event) {
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
    actor?: AuditActor;
  }) {
    const name = input.name.trim();
    if (!name) throw new BadRequestException('Name is required');
    const compareOp = input.compareOp ?? 'eq';
    if (!['eq', 'gt', 'lt', 'neq'].includes(compareOp)) {
      throw new BadRequestException('Operator must be eq, gt, lt, or neq');
    }
    const duplicate = await this.definitions.findOne({ where: { name } });
    if (duplicate) {
      throw new ConflictException(`An alarm named "${name}" already exists`);
    }
    const severity = await this.resolveWritableSeverity(
      input.severity,
      'alarm.create_denied',
      name,
      input.actor,
    );
    const register = await this.registers.findOneBy({ id: input.registerId });
    if (!register) throw new NotFoundException('Register not found');
    return this.definitions
      .save(
        this.definitions.create({
          name,
          severity,
          compareOp,
          threshold: Number.isFinite(input.threshold)
            ? Number(input.threshold)
            : 1,
          enabled: input.enabled !== false,
          register,
        }),
      )
      .then(async (saved) => {
        await this.auditService.write({
          ...auditWriteFields(input.actor),
          action: 'alarm.create',
          resource: saved.name,
          details: this.definitionAuditDetails(saved),
          result: 'success',
        });
        return saved;
      });
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
      actor?: AuditActor;
    },
  ) {
    const row = await this.definitions.findOneBy({ id });
    if (!row) throw new NotFoundException('Alarm definition not found');
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) throw new BadRequestException('Name is required');
      if (name !== row.name) {
        const duplicate = await this.definitions.findOne({ where: { name } });
        if (duplicate) {
          throw new ConflictException(
            `An alarm named "${name}" already exists`,
          );
        }
      }
      row.name = name;
    }
    if (input.severity !== undefined) {
      row.severity = await this.resolveWritableSeverity(
        input.severity,
        'alarm.update_denied',
        row.name,
        input.actor,
      );
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
    return this.definitions.save(row).then(async (saved) => {
      await this.auditService.write({
        ...auditWriteFields(input.actor),
        action: 'alarm.update',
        resource: saved.name,
        details: this.definitionAuditDetails(saved),
        result: 'success',
      });
      return saved;
    });
  }

  async deleteDefinition(id: string, actor?: AuditActor) {
    const row = await this.definitions.findOneBy({ id });
    if (!row) throw new NotFoundException('Alarm definition not found');
    // Drop history first — alarm_events.definition_id has no ON DELETE CASCADE
    // on existing SQLite DBs, so remove() alone returns 500.
    await this.events
      .createQueryBuilder()
      .delete()
      .where('definition_id = :id', { id })
      .execute();
    await this.definitions.remove(row);
    this.activeByDef.delete(id);
    await this.auditService.write({
      ...auditWriteFields(actor),
      action: 'alarm.delete',
      resource: row.name,
      result: 'success',
    });
    return { ok: true as const };
  }
}
