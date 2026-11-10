import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DEMO_CRANE_MAP,
  DEMO_P03A21_MAP,
  pendantDiName,
  pendantDoName,
} from '@tele-pendant/modbus-core';
import { Repository } from 'typeorm';
import { BackgroundDisplay } from '../../backgrounds/entities/background-display.entity';
import { Cell } from '../../cells/entities/cell.entity';
import { OverlayLabel } from '../../overlays/entities/overlay-label.entity';
import { RegisterMap } from '../../registers/entities/register-map.entity';
import { SafetyRoles } from '../../safety/entities/safety-roles.entity';

const DEMO_NODE_IDS: Record<string, string> = {
  'coil.deadman': 'ns=1;s=Deadman',
  'coil.eStop': 'ns=1;s=EStop',
  'holding.heartbeat': 'ns=1;s=Heartbeat',
  'holding.safeState': 'ns=1;s=SafeState',
};

/** Short Operator names written by earlier seeds → P03A21 drawing words. */
const P03A21_DRAWING_LABELS: Record<string, string> = {
  'Teach Pipe Middle': 'Teach Pipe Middle Position',
  'Teach Welding Pos.': 'OWVA/OWCA Teach Welding Position',
  'Teach Seam Laser': 'Teach Seam Tracking Laser',
  'OWFF close/open': 'OWFF Welding Flux Flap close/open',
  'OWFF Flux Flap close/open': 'OWFF Welding Flux Flap close/open',
  'Seam Tracking': 'Seam Tracking on/off',
  'Move Home': 'OWVA, OWCA, OWCVA Move Home Position',
  'Move Home Position': 'OWVA, OWCA, OWCVA Move Home Position',
  'OWHA back/fwd': 'OWHA backw./forw.',
  'Height Reg.': 'OWVA Height Reg. on/off',
  'Axis fast/slow': 'Axis fast/slowly',
  'Move Welding Pos.': 'OWVA, OWCA, OWCVA Move Welding Posit.',
  'Move Welding Position': 'OWVA, OWCA, OWCVA Move Welding Posit.',
  'OWWAC up/down': 'OWWAC Wire Feed AC up/down',
  'OWWDC up/down': 'OWWDC Wire Feed DC up/down',
  'OWCA back/fwd': 'OWCA backw./forw.',
};

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
      this.logger.log('Seeding P03A21 welding pendant HMI layout');
      await this.seed();
    } else {
      await this.ensureP03a21Layout();
    }
    await this.syncP03a21DrawingLabels();
    await this.ensureRuntimeRegisters();
    await this.ensureSafetyRoles();
  }

  /**
   * Existing DBs still hold the old crane demo after image deploy.
   * Promote them to P03A21 when no selector cells / pendant background exist.
   */
  private async ensureP03a21Layout(): Promise<void> {
    const selectorCount = await this.cells
      .createQueryBuilder('cell')
      .where('cell.style = :style', { style: 'selector' })
      .getCount();
    if (selectorCount > 0) return;

    const active = await this.backgrounds.findOne({ where: { active: true } });
    if ((active?.name ?? '').includes('p03a21')) return;

    this.logger.log(
      'Migrating legacy HMI layout to P03A21 welding pendant demo',
    );
    await this.resetP03a21Demo();
  }

  /** Rename shortened demo labels in place. Custom names are left alone. */
  private async syncP03a21DrawingLabels(): Promise<void> {
    const rows = await this.cells.find();
    for (const cell of rows) {
      const next = P03A21_DRAWING_LABELS[cell.label];
      if (!next) continue;
      cell.label = next;
      await this.cells.save(cell);
    }
  }

  /** Safety + crane leftovers the poller still resolves by name. */
  private async ensureRuntimeRegisters(): Promise<void> {
    const extras: Array<[string, number, RegisterMap['kind'], string, string]> =
      [
        ['coil.deadman', DEMO_CRANE_MAP.coils.deadman, 'coil', 'bool', 'rw'],
        ['coil.eStop', DEMO_CRANE_MAP.coils.eStop, 'coil', 'bool', 'rw'],
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
        [
          'discrete.motorRunning',
          DEMO_CRANE_MAP.discretes.motorRunning,
          'discrete',
          'bool',
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
    if (!row) {
      try {
        row = await this.registers.save(
          this.registers.create({
            name,
            address,
            kind,
            dataType,
            rw,
            scale: 1,
            trended: false,
            nodeId,
          }),
        );
        return row;
      } catch {
        // Parallel seed races can hit UNIQUE(name); re-read the winner.
        row = await this.registers.findOne({ where: { name } });
        if (!row) throw new Error(`Failed to upsert register ${name}`);
      }
    }
    if (nodeId && !row.nodeId) {
      row.nodeId = nodeId;
      row = await this.registers.save(row);
    }
    return row;
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

  /** Admin reset: wipe cells/overlays and reseed P03A21 (keeps registers). */
  async resetP03a21Demo(): Promise<{ ok: true; cells: number }> {
    await this.overlays.createQueryBuilder().delete().execute();
    await this.cells.createQueryBuilder().delete().execute();
    await this.seed();
    const cells = await this.cells.count();
    this.logger.log(`P03A21 demo reset complete (${cells} cells)`);
    return { ok: true, cells };
  }

  async seed(): Promise<void> {
    await this.ensureRuntimeRegisters();

    const di = async (key: keyof typeof DEMO_P03A21_MAP.di) =>
      this.upsertRegister(
        pendantDiName(key),
        DEMO_P03A21_MAP.di[key],
        'coil',
        'bool',
        'rw',
      );
    const lamp = async (key: keyof typeof DEMO_P03A21_MAP.do) =>
      this.upsertRegister(
        pendantDoName(key),
        DEMO_P03A21_MAP.do[key],
        'coil',
        'bool',
        'rw',
      );

    const eStop = await this.upsertRegister(
      'coil.eStop',
      DEMO_P03A21_MAP.safety.eStop,
      'coil',
      'bool',
      'rw',
    );

    const [
      buttonsActiveDi,
      teachPipeDi,
      teachWeldDi,
      teachSeamDi,
      seamTrackDi,
      moveHomeDi,
      heightRegDi,
      axisFastDi,
      moveWeldDi,
      enableDi,
      owcvaDown,
      owcvaUp,
      owvaUp,
      owvaDown,
      owhaBack,
      owhaFwd,
      owcaBack,
      owcaFwd,
      owwacUp,
      owwacDown,
      owwdcUp,
      owwdcDown,
      owffClose,
      owffOpen,
    ] = await Promise.all([
      di('buttonsActive'),
      di('teachPipeMiddle'),
      di('teachWeldingPosition'),
      di('teachSeamTrackingLaser'),
      di('seamTrackingOnOff'),
      di('moveHomePosition'),
      di('owvaHeightReg'),
      di('axisFastSlowly'),
      di('moveWeldingPosition'),
      di('enable'),
      di('owcvaDown'),
      di('owcvaUp'),
      di('owvaUp'),
      di('owvaDown'),
      di('owhaBack'),
      di('owhaFwd'),
      di('owcaBack'),
      di('owcaFwd'),
      di('owwacUp'),
      di('owwacDown'),
      di('owwdcUp'),
      di('owwdcDown'),
      di('owffClose'),
      di('owffOpen'),
    ]);

    const [
      buttonsActiveLamp,
      teachSeamLamp,
      teachWeldLamp,
      seamTrackLamp,
      moveHomeLamp,
      heightRegLamp,
      axisFastLamp,
      moveWeldLamp,
      owcvaLamp,
      owvaLamp,
      owhaLamp,
      owcaLamp,
      owwacLamp,
      owwdcLamp,
      owffLamp,
    ] = await Promise.all([
      lamp('buttonsActive'),
      lamp('teachSeamTrackingLaser'),
      lamp('teachWeldingPosition'),
      lamp('seamTrackingOnOff'),
      lamp('moveHomePosition'),
      lamp('owvaHeightReg'),
      lamp('axisFastSlowly'),
      lamp('moveWeldingPosition'),
      lamp('owcvaSelector'),
      lamp('owvaSelector'),
      lamp('owhaSelector'),
      lamp('owcaSelector'),
      lamp('owwacSelector'),
      lamp('owwdcSelector'),
      lamp('owffSelector'),
    ]);
    // No dedicated teach-pipe lamp on the drawing; reuse seam-tracking lamp DO.
    const teachPipeLamp = teachSeamLamp;

    const bg = await this.backgrounds.findOne({
      where: { name: 'demo-p03a21' },
    });
    if (!bg) {
      await this.backgrounds.update({ active: true }, { active: false });
      await this.backgrounds.save(
        this.backgrounds.create({
          name: 'demo-p03a21',
          active: true,
          cssBackground:
            'linear-gradient(165deg, #2a2a2e 0%, #1a1a1c 40%, #3d3a2e 100%)',
          imageUrl: null,
        }),
      );
    } else if (!bg.active) {
      await this.backgrounds.update({ active: true }, { active: false });
      bg.active = true;
      await this.backgrounds.save(bg);
    }

    type CellDef = {
      row: number;
      col: number;
      label: string;
      style: string;
      primary: RegisterMap;
      secondary?: RegisterMap;
      feedback?: RegisterMap;
      isMotion?: boolean;
      requiresSafeAction?: boolean;
      variableSpeed?: boolean;
    };

    const cellDefs: CellDef[] = [
      // Row 0 — drawing words. The matrix wraps them; it does not shorten them.
      {
        row: 0,
        col: 0,
        label: 'Buttons active',
        style: 'pushbutton',
        primary: buttonsActiveDi,
        feedback: buttonsActiveLamp,
      },
      {
        row: 0,
        col: 1,
        label: 'Teach Pipe Middle Position',
        style: 'pushbutton',
        primary: teachPipeDi,
        feedback: teachPipeLamp,
      },
      {
        row: 0,
        col: 2,
        label: 'OWVA/OWCA Teach Welding Position',
        style: 'pushbutton',
        primary: teachWeldDi,
        feedback: teachWeldLamp,
      },
      // Row 1
      {
        row: 1,
        col: 0,
        label: 'Teach Seam Tracking Laser',
        style: 'pushbutton',
        primary: teachSeamDi,
        feedback: teachSeamLamp,
      },
      {
        row: 1,
        col: 1,
        label: 'OWFF Welding Flux Flap close/open',
        style: 'selector',
        primary: owffClose,
        secondary: owffOpen,
        feedback: owffLamp,
        isMotion: false,
        variableSpeed: false,
      },
      {
        row: 1,
        col: 2,
        label: 'Seam Tracking on/off',
        style: 'pushbutton',
        primary: seamTrackDi,
        feedback: seamTrackLamp,
      },
      // Row 2
      {
        row: 2,
        col: 0,
        label: 'OWVA, OWCA, OWCVA Move Home Position',
        style: 'pushbutton',
        primary: moveHomeDi,
        feedback: moveHomeLamp,
      },
      {
        row: 2,
        col: 1,
        label: 'OWCVA down/up',
        style: 'selector',
        primary: owcvaDown,
        secondary: owcvaUp,
        feedback: owcvaLamp,
        isMotion: true,
      },
      {
        row: 2,
        col: 2,
        label: 'OWHA backw./forw.',
        style: 'selector',
        primary: owhaBack,
        secondary: owhaFwd,
        feedback: owhaLamp,
        isMotion: true,
      },
      // Row 3
      {
        row: 3,
        col: 0,
        label: 'OWVA Height Reg. on/off',
        style: 'pushbutton',
        primary: heightRegDi,
        feedback: heightRegLamp,
      },
      {
        row: 3,
        col: 1,
        label: 'Axis fast/slowly',
        style: 'pushbutton',
        primary: axisFastDi,
        feedback: axisFastLamp,
      },
      {
        row: 3,
        col: 2,
        label: 'OWVA up/down',
        style: 'selector',
        primary: owvaUp,
        secondary: owvaDown,
        feedback: owvaLamp,
        isMotion: true,
      },
      // Row 4
      {
        row: 4,
        col: 0,
        label: 'OWVA, OWCA, OWCVA Move Welding Posit.',
        style: 'pushbutton',
        primary: moveWeldDi,
        feedback: moveWeldLamp,
      },
      {
        row: 4,
        col: 1,
        label: 'OWWAC Wire Feed AC up/down',
        style: 'selector',
        primary: owwacUp,
        secondary: owwacDown,
        feedback: owwacLamp,
        isMotion: true,
      },
      {
        row: 4,
        col: 2,
        label: 'OWWDC Wire Feed DC up/down',
        style: 'selector',
        primary: owwdcUp,
        secondary: owwdcDown,
        feedback: owwdcLamp,
        isMotion: true,
      },
      // Row 5 — STOP docks out (hole at 5,0); Enable; OWCA
      {
        row: 5,
        col: 0,
        label: 'STOP',
        style: 'estop',
        primary: eStop,
        requiresSafeAction: true,
      },
      {
        row: 5,
        col: 1,
        label: 'Enable',
        style: 'enable',
        primary: enableDi,
      },
      {
        row: 5,
        col: 2,
        label: 'OWCA backw./forw.',
        style: 'selector',
        primary: owcaBack,
        secondary: owcaFwd,
        feedback: owcaLamp,
        isMotion: true,
      },
    ];

    for (const def of cellDefs) {
      const isMotion = def.isMotion ?? false;
      await this.cells.save(
        this.cells.create({
          row: def.row,
          col: def.col,
          label: def.label,
          style: def.style,
          primaryRegister: def.primary,
          secondaryRegister: def.secondary ?? null,
          feedbackRegister: def.feedback ?? null,
          statusRegister: null,
          isMotion,
          requiresSafeAction: def.requiresSafeAction ?? false,
          // Pendant uses the Axis fast/slowly cell; hide the separate jog strip.
          variableSpeed: def.variableSpeed ?? false,
          slowSpeedPct: 30,
          fastSpeedPct: 100,
        }),
      );
    }

    await this.ensureSafetyRoles();
  }
}
