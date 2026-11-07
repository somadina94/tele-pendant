import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DEMO_CRANE_MAP } from '@tele-pendant/modbus-core';
import { Repository } from 'typeorm';
import { BackgroundDisplay } from '../../backgrounds/entities/background-display.entity';
import { Cell } from '../../cells/entities/cell.entity';
import { OverlayLabel } from '../../overlays/entities/overlay-label.entity';
import { RegisterMap } from '../../registers/entities/register-map.entity';
import { SafetyRoles } from '../../safety/entities/safety-roles.entity';

const DEMO_NODE_IDS: Record<string, string> = {
  'coil.hoistUp': 'ns=1;s=HoistUp',
  'coil.hoistDown': 'ns=1;s=HoistDown',
  'coil.trolleyLeft': 'ns=1;s=TrolleyLeft',
  'coil.trolleyRight': 'ns=1;s=TrolleyRight',
  'coil.bridgeFwd': 'ns=1;s=BridgeFwd',
  'coil.bridgeRev': 'ns=1;s=BridgeRev',
  'coil.deadman': 'ns=1;s=Deadman',
  'coil.eStop': 'ns=1;s=EStop',
  'holding.trolleyPosition': 'ns=1;s=TrolleyPosition',
  'holding.hoistHeightMm': 'ns=1;s=HoistHeightMm',
  'holding.loadKg': 'ns=1;s=LoadKg',
  'holding.speedPct': 'ns=1;s=SpeedPct',
  'holding.heartbeat': 'ns=1;s=Heartbeat',
  'holding.safeState': 'ns=1;s=SafeState',
  'discrete.motorRunning': 'ns=1;s=MotorRunning',
  'discrete.fault': 'ns=1;s=Fault',
  'discrete.commsOk': 'ns=1;s=CommsOk',
};

const TRENDED = new Set(['holding.hoistHeightMm', 'holding.loadKg']);

@Injectable()
export class HmiSeedService implements OnModuleInit {
  private readonly logger = new Logger(HmiSeedService.name);

  constructor(
    @InjectRepository(RegisterMap)
    private readonly registers: Repository<RegisterMap>,
    @InjectRepository(Cell)
    private readonly cells: Repository<Cell>,
    @InjectRepository(BackgroundDisplay)
    private readonly backgrounds: Repository<BackgroundDisplay>,
    @InjectRepository(OverlayLabel)
    private readonly overlays: Repository<OverlayLabel>,
    @InjectRepository(SafetyRoles)
    private readonly roles: Repository<SafetyRoles>,
  ) {}

  async onModuleInit(): Promise<void> {
    const count = await this.cells.count();
    if (count === 0) {
      this.logger.log('Seeding demo crane HMI layout');
      await this.seed();
    }
    await this.ensureRuntimeRegisters();
    await this.ensureTrolleyFeedback();
    await this.ensureTrolleyOverlay();
    await this.ensureSafetyRoles();
  }

  /** Rows the safety poller looks up by name. Never overwrites a saved address. */
  private async ensureRuntimeRegisters(): Promise<void> {
    const extras: Array<[string, number, RegisterMap['kind'], string, string]> =
      [
        ['coil.deadman', DEMO_CRANE_MAP.coils.deadman, 'coil', 'bool', 'rw'],
        [
          'coil.bridgeFwd',
          DEMO_CRANE_MAP.coils.bridgeFwd,
          'coil',
          'bool',
          'rw',
        ],
        [
          'coil.bridgeRev',
          DEMO_CRANE_MAP.coils.bridgeRev,
          'coil',
          'bool',
          'rw',
        ],
        [
          'holding.heartbeat',
          DEMO_CRANE_MAP.holdings.heartbeat,
          'holding',
          'uint16',
          'rw',
        ],
        [
          'holding.safeState',
          DEMO_CRANE_MAP.holdings.safeState,
          'holding',
          'uint16',
          'rw',
        ],
        [
          'holding.speedPct',
          DEMO_CRANE_MAP.holdings.speedPct,
          'holding',
          'uint16',
          'r',
        ],
        [
          'discrete.fault',
          DEMO_CRANE_MAP.discretes.fault,
          'discrete',
          'bool',
          'r',
        ],
        [
          'discrete.commsOk',
          DEMO_CRANE_MAP.discretes.commsOk,
          'discrete',
          'bool',
          'r',
        ],
        ['coil.eStop', DEMO_CRANE_MAP.coils.eStop, 'coil', 'bool', 'rw'],
        [
          'holding.hoistHeightMm',
          DEMO_CRANE_MAP.holdings.hoistHeightMm,
          'holding',
          'uint16',
          'r',
        ],
        [
          'holding.loadKg',
          DEMO_CRANE_MAP.holdings.loadKg,
          'holding',
          'uint16',
          'r',
        ],
        [
          'holding.trolleyPosition',
          DEMO_CRANE_MAP.holdings.trolleyPosition,
          'holding',
          'uint16',
          'r',
        ],
      ];
    for (const [name, address, kind, dataType, rw] of extras) {
      await this.upsertRegister(name, address, kind, dataType, rw);
    }
  }

  private async upsertRegister(
    name: string,
    address: number,
    kind: RegisterMap['kind'],
    dataType: string,
    rw: string,
  ): Promise<RegisterMap> {
    let row = await this.registers.findOne({ where: { name } });
    const nodeId = DEMO_NODE_IDS[name] ?? null;
    const trended = TRENDED.has(name);
    if (!row) {
      row = await this.registers.save(
        this.registers.create({
          name,
          address,
          kind,
          dataType,
          rw,
          scale: 1,
          trended,
          nodeId,
        }),
      );
      return row;
    }
    let dirty = false;
    if (trended && !row.trended) {
      row.trended = true;
      dirty = true;
    }
    if (nodeId && !row.nodeId) {
      row.nodeId = nodeId;
      dirty = true;
    }
    if (dirty) row = await this.registers.save(row);
    return row;
  }

  /**
   * TP-15: Trolley L/R must show motor run/idle + trolley position on the
   * matrix badges (same pattern as hoist height). Force-correct bindings so
   * older DBs / wrong Config saves still light up on boot.
   */
  private async ensureTrolleyFeedback(): Promise<void> {
    const motor = await this.registers.findOne({
      where: { name: 'discrete.motorRunning' },
    });
    const position = await this.registers.findOne({
      where: { name: 'holding.trolleyPosition' },
    });
    if (!motor && !position) return;
    const rows = await this.cells.find({
      relations: {
        primaryRegister: true,
        feedbackRegister: true,
        statusRegister: true,
      },
    });
    for (const cell of rows) {
      const name = cell.primaryRegister?.name;
      if (name !== 'coil.trolleyLeft' && name !== 'coil.trolleyRight') continue;
      let dirty = false;
      if (motor && cell.feedbackRegister?.id !== motor.id) {
        cell.feedbackRegister = motor;
        dirty = true;
      }
      if (position && cell.statusRegister?.id !== position.id) {
        cell.statusRegister = position;
        dirty = true;
      }
      if (dirty) await this.cells.save(cell);
    }
  }

  /** TP-15: plant graphic gets a trolley travel overlay when missing. */
  private async ensureTrolleyOverlay(): Promise<void> {
    const position = await this.registers.findOne({
      where: { name: 'holding.trolleyPosition' },
    });
    if (!position) return;
    const background = await this.backgrounds.findOne({
      where: { active: true },
    });
    if (!background) return;
    const existing = await this.overlays.find({
      where: { background: { id: background.id } },
      relations: { register: true },
    });
    if (
      existing.some(
        (row) =>
          row.register?.name === 'holding.trolleyPosition' ||
          row.label.trim().toLowerCase() === 'trolley',
      )
    ) {
      return;
    }
    await this.overlays.save(
      this.overlays.create({
        label: 'Trolley',
        xPct: 72,
        yPct: 48,
        format: '{value} mm',
        background,
        register: position,
      }),
    );
  }

  private async ensureSafetyRoles(): Promise<void> {
    const [existing] = await this.roles.find({ take: 1 });
    if (existing) return;
    const idOf = async (name: string) =>
      (await this.registers.findOne({ where: { name } }))?.id ?? null;
    await this.roles.save(
      this.roles.create({
        eStopRegisterId: await idOf('coil.eStop'),
        deadmanRegisterId: await idOf('coil.deadman'),
        heartbeatRegisterId: await idOf('holding.heartbeat'),
        safeStateRegisterId: await idOf('holding.safeState'),
      }),
    );
  }

  async seed(): Promise<void> {
    const hoistUp = await this.upsertRegister(
      'coil.hoistUp',
      DEMO_CRANE_MAP.coils.hoistUp,
      'coil',
      'bool',
      'rw',
    );
    const hoistDown = await this.upsertRegister(
      'coil.hoistDown',
      DEMO_CRANE_MAP.coils.hoistDown,
      'coil',
      'bool',
      'rw',
    );
    const trolleyLeft = await this.upsertRegister(
      'coil.trolleyLeft',
      DEMO_CRANE_MAP.coils.trolleyLeft,
      'coil',
      'bool',
      'rw',
    );
    const trolleyRight = await this.upsertRegister(
      'coil.trolleyRight',
      DEMO_CRANE_MAP.coils.trolleyRight,
      'coil',
      'bool',
      'rw',
    );
    const eStop = await this.upsertRegister(
      'coil.eStop',
      DEMO_CRANE_MAP.coils.eStop,
      'coil',
      'bool',
      'rw',
    );
    const height = await this.upsertRegister(
      'holding.hoistHeightMm',
      DEMO_CRANE_MAP.holdings.hoistHeightMm,
      'holding',
      'uint16',
      'r',
    );
    const loadKg = await this.upsertRegister(
      'holding.loadKg',
      DEMO_CRANE_MAP.holdings.loadKg,
      'holding',
      'uint16',
      'r',
    );
    const motorRunning = await this.upsertRegister(
      'discrete.motorRunning',
      DEMO_CRANE_MAP.discretes.motorRunning,
      'discrete',
      'bool',
      'r',
    );
    const trolleyPosition = await this.upsertRegister(
      'holding.trolleyPosition',
      DEMO_CRANE_MAP.holdings.trolleyPosition,
      'holding',
      'uint16',
      'r',
    );

    const bg = await this.backgrounds.save(
      this.backgrounds.create({
        name: 'demo-crane',
        active: true,
        cssBackground:
          'linear-gradient(160deg, #1a2332 0%, #0f1419 45%, #1e2a1e 100%)',
        imageUrl: null,
      }),
    );

    await this.overlays.save([
      this.overlays.create({
        label: 'Height',
        xPct: 18,
        yPct: 22,
        format: '{value} mm',
        background: bg,
        register: height,
      }),
      this.overlays.create({
        label: 'Load',
        xPct: 72,
        yPct: 22,
        format: '{value} kg',
        background: bg,
        register: loadKg,
      }),
      this.overlays.create({
        label: 'Motor',
        xPct: 45,
        yPct: 70,
        format: '{value}',
        background: bg,
        register: motorRunning,
      }),
      this.overlays.create({
        label: 'Trolley',
        xPct: 72,
        yPct: 48,
        format: '{value} mm',
        background: bg,
        register: trolleyPosition,
      }),
    ]);

    const cellDefs: Array<{
      row: number;
      col: number;
      label: string;
      style: string;
      primary: RegisterMap;
      feedback?: RegisterMap;
      status?: RegisterMap;
      isMotion?: boolean;
      requiresSafeAction?: boolean;
    }> = [
      {
        row: 0,
        col: 1,
        label: 'Hoist Up',
        style: 'motion',
        primary: hoistUp,
        feedback: motorRunning,
        status: height,
        isMotion: true,
      },
      {
        row: 1,
        col: 0,
        label: 'Trolley L',
        style: 'motion',
        primary: trolleyLeft,
        feedback: motorRunning,
        status: trolleyPosition,
        isMotion: true,
      },
      {
        row: 1,
        col: 1,
        label: 'STOP',
        style: 'estop',
        primary: eStop,
        requiresSafeAction: true,
      },
      {
        row: 1,
        col: 2,
        label: 'Trolley R',
        style: 'motion',
        primary: trolleyRight,
        feedback: motorRunning,
        status: trolleyPosition,
        isMotion: true,
      },
      {
        row: 2,
        col: 1,
        label: 'Hoist Down',
        style: 'motion',
        primary: hoistDown,
        feedback: motorRunning,
        status: height,
        isMotion: true,
      },
    ];

    for (const def of cellDefs) {
      await this.cells.save(
        this.cells.create({
          row: def.row,
          col: def.col,
          label: def.label,
          style: def.style,
          primaryRegister: def.primary,
          feedbackRegister: def.feedback ?? null,
          statusRegister: def.status ?? null,
          isMotion: def.isMotion ?? false,
          requiresSafeAction: def.requiresSafeAction ?? false,
        }),
      );
    }
  }
}
