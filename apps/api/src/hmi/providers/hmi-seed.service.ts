import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DEMO_CRANE_MAP } from '@tele-pendant/modbus-core';
import { Repository } from 'typeorm';
import { BackgroundDisplay } from '../../backgrounds/entities/background-display.entity';
import { Cell } from '../../cells/entities/cell.entity';
import { OverlayLabel } from '../../overlays/entities/overlay-label.entity';
import { RegisterMap } from '../../registers/entities/register-map.entity';

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
  ) {}

  async onModuleInit(): Promise<void> {
    const count = await this.cells.count();
    if (count > 0) return;
    this.logger.log('Seeding demo crane HMI layout');
    await this.seed();
  }

  private async upsertRegister(
    name: string,
    address: number,
    kind: RegisterMap['kind'],
    dataType: string,
    rw: string,
  ): Promise<RegisterMap> {
    let row = await this.registers.findOne({ where: { name } });
    if (!row) {
      row = await this.registers.save(
        this.registers.create({ name, address, kind, dataType, rw, scale: 1 }),
      );
    }
    return row;
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
