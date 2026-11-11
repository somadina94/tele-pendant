import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { tmpdir } from 'node:os';
import { HmiService } from './hmi.service';
import { UserRole } from '../../users/enums/user-role.enum';

describe('HmiService', () => {
  const motionCell = {
    id: 'c1',
    label: 'Hoist Up',
    isMotion: true,
    requiresSafeAction: false,
    variableSpeed: true,
    slowSpeedPct: 30,
    fastSpeedPct: 100,
    primaryRegister: { kind: 'coil', address: 0, name: 'coil.hoistUp' },
    row: 0,
    col: 0,
  };

  const cells = {
    find: jest.fn().mockResolvedValue([motionCell]),
    findOne: jest.fn().mockResolvedValue(motionCell),
    findOneBy: jest.fn(),
    create: jest.fn((row: Record<string, unknown>) => ({ ...row })),
    save: jest.fn(async (row: { id?: string }) => ({
      id: row.id ?? 'new-cell',
      ...row,
    })),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  const registers = {
    find: jest.fn().mockResolvedValue([{ name: 'coil.hoistUp' }]),
    findOneBy: jest.fn(),
    save: jest.fn(
      async (row: { id: string; name: string; address: number }) => row,
    ),
  };
  const backgrounds = {
    find: jest
      .fn()
      .mockResolvedValue([{ id: 'bg1', name: 'demo-crane', active: true }]),
    findOne: jest.fn().mockResolvedValue({ id: 'bg1', active: true }),
    findOneBy: jest.fn(),
    create: jest.fn((row: Record<string, unknown>) => ({ ...row })),
    save: jest.fn(async (row: { id: string } | Array<{ id: string }>) => row),
  };
  const overlays = {
    find: jest.fn().mockResolvedValue([{ id: 'o1', text: 'H' }]),
    findOneBy: jest.fn(),
    create: jest.fn((row: Record<string, unknown>) => ({ ...row })),
    save: jest.fn(async (row: { id?: string }) => ({
      id: row.id ?? 'new-overlay',
      ...row,
    })),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  const plcService = {
    writeCoil: jest.fn().mockResolvedValue(undefined),
    writeHolding: jest.fn().mockResolvedValue(undefined),
    forgetAddresses: jest.fn(),
    getDriver: jest.fn().mockReturnValue({}),
  };
  const safetyState = {
    canIssueMotion: jest.fn().mockReturnValue(false),
    snapshot: jest.fn().mockReturnValue({ mode: 'normal' }),
    latchOperatorEStop: jest.fn().mockResolvedValue({ mode: 'e_stop' }),
    noteMotionCoilAsserted: jest.fn(),
    noteMotionCoilCleared: jest.fn(),
    getRoles: jest.fn().mockResolvedValue({
      eStopRegisterId: 'estop-id',
      deadmanRegisterId: 'dead-id',
      heartbeatRegisterId: 'beat-id',
      safeStateRegisterId: 'safe-id',
    }),
  };
  const safeActionPin = {
    verify: jest.fn(async (_userId: string | undefined, pin: string) => {
      return pin.trim() === '1234';
    }),
  };
  const auditService = { write: jest.fn().mockResolvedValue({}) };

  let service: HmiService;
  const prevPin = process.env.SAFE_ACTION_PIN;
  const prevAdmin = process.env.ADMIN_PASSWORD;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SAFE_ACTION_PIN = '1234';
    delete process.env.ADMIN_PASSWORD;
    cells.find.mockResolvedValue([motionCell]);
    cells.findOne.mockResolvedValue(motionCell);
    registers.findOneBy.mockResolvedValue(null);
    backgrounds.find.mockResolvedValue([
      { id: 'bg1', name: 'demo-crane', active: true },
    ]);
    backgrounds.findOne.mockResolvedValue({ id: 'bg1', active: true });
    backgrounds.findOneBy.mockResolvedValue(null);
    safetyState.canIssueMotion.mockReturnValue(false);
    safetyState.getRoles.mockResolvedValue({
      eStopRegisterId: 'estop-id',
      deadmanRegisterId: 'dead-id',
      heartbeatRegisterId: 'beat-id',
      safeStateRegisterId: 'safe-id',
    });
    safeActionPin.verify.mockImplementation(
      async (_userId: string | undefined, pin: string) => pin.trim() === '1234',
    );
    service = new HmiService(
      cells as never,
      registers as never,
      backgrounds as never,
      overlays as never,
      plcService as never,
      safetyState as never,
      auditService as never,
      safeActionPin as never,
    );
  });

  afterAll(() => {
    if (prevPin === undefined) delete process.env.SAFE_ACTION_PIN;
    else process.env.SAFE_ACTION_PIN = prevPin;
    if (prevAdmin === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = prevAdmin;
  });

  it('returns layout with matrix overlays and registers', async () => {
    const layout = await service.getLayout();
    expect(layout.matrix).toEqual({ rows: 1, cols: 1 });
    expect(layout.overlays).toHaveLength(1);
    expect(layout.backgrounds).toEqual([
      { id: 'bg1', name: 'demo-crane', active: true },
    ]);
    expect(layout.safety.mode).toBe('normal');
    expect(await service.listRegisters()).toHaveLength(1);
  });

  it('layout without background skips overlays and empty cells', async () => {
    cells.find.mockResolvedValue([]);
    backgrounds.findOne.mockResolvedValue(null);
    const layout = await service.getLayout();
    expect(layout.matrix).toEqual({ rows: 0, cols: 0 });
    expect(layout.overlays).toEqual([]);
  });

  it('blocks motion without deadman', async () => {
    await expect(
      service.activateCell('c1', true, { role: UserRole.OPERATOR }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('writes coil when motion allowed', async () => {
    safetyState.canIssueMotion.mockReturnValue(true);
    const result = await service.activateCell('c1', true, {
      role: UserRole.OPERATOR,
      userId: 'u1',
      userEmail: 'op@example.com',
    });
    expect(safetyState.canIssueMotion).toHaveBeenCalledWith('u1', undefined);
    expect(plcService.writeCoil).toHaveBeenCalledWith(0, true);
    expect(result.ok).toBe(true);
  });

  it('runs motion writes through driver.runExclusive when present', async () => {
    safetyState.canIssueMotion.mockReturnValue(true);
    const runExclusive = jest.fn(async (fn: () => Promise<void>) => fn());
    plcService.getDriver.mockReturnValue({ runExclusive });
    await service.activateCell('c1', true, {
      role: UserRole.OPERATOR,
      userId: 'u1',
    });
    expect(runExclusive).toHaveBeenCalled();
    expect(plcService.writeCoil).toHaveBeenCalledWith(0, true);
  });

  it('swallows audit failures on activate', async () => {
    safetyState.canIssueMotion.mockReturnValue(true);
    auditService.write.mockRejectedValueOnce(new Error('audit down'));
    await expect(
      service.activateCell('c1', true, {
        role: UserRole.OPERATOR,
        userId: 'u1',
        userEmail: 'op@example.com',
      }),
    ).resolves.toEqual(expect.objectContaining({ ok: true }));
    await new Promise<void>((resolve) => setImmediate(resolve));
  });

  it('skips audit on hold refresh activates', async () => {
    safetyState.canIssueMotion.mockReturnValue(true);
    auditService.write.mockClear();
    plcService.writeHolding.mockClear();
    registers.findOneBy.mockResolvedValue({
      name: 'holding.speedPct',
      kind: 'holding',
      address: 2,
    });
    await service.activateCell('c1', true, {
      role: UserRole.OPERATOR,
      userId: 'u1',
      refresh: true,
      speed: 'fast',
    });
    expect(plcService.writeCoil).toHaveBeenCalledWith(0, true);
    expect(plcService.writeHolding).not.toHaveBeenCalled();
    expect(auditService.write).not.toHaveBeenCalled();
  });

  it('throws when cell missing or without primary register', async () => {
    cells.findOne.mockResolvedValue(null);
    await expect(
      service.activateCell('missing', true, { role: UserRole.OPERATOR }),
    ).rejects.toBeInstanceOf(NotFoundException);

    cells.findOne.mockResolvedValue({ ...motionCell, primaryRegister: null });
    await expect(
      service.activateCell('c1', true, { role: UserRole.OPERATOR }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('selector rocker writes mutual-exclusive coils with direction', async () => {
    const selectorCell = {
      ...motionCell,
      id: 'sel1',
      label: 'OWVA up/down',
      style: 'selector',
      primaryRegister: {
        kind: 'coil',
        address: 26,
        name: 'coil.p03a21.di.owvaUp',
      },
      secondaryRegister: {
        kind: 'coil',
        address: 27,
        name: 'coil.p03a21.di.owvaDown',
      },
    };
    cells.findOne.mockResolvedValue(selectorCell);
    safetyState.canIssueMotion.mockReturnValue(true);
    registers.findOneBy.mockImplementation(async (q: { name?: string }) => {
      if (q.name === 'coil.p03a21.di.enable') {
        return { name: q.name, kind: 'coil', address: 43 };
      }
      if (q.name === 'holding.speedPct') {
        return { name: q.name, kind: 'holding', address: 2 };
      }
      return null;
    });
    plcService.getDriver.mockReturnValue({
      readCoils: jest.fn().mockResolvedValue([true]),
    });

    await expect(
      service.activateCell('sel1', true, {
        role: UserRole.OPERATOR,
        userId: 'u1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await service.activateCell('sel1', true, {
      role: UserRole.OPERATOR,
      userId: 'u1',
      direction: 'a',
    });
    expect(plcService.writeCoil).toHaveBeenCalledWith(27, false);
    expect(plcService.writeCoil).toHaveBeenCalledWith(26, true);

    plcService.writeCoil.mockClear();
    await service.activateCell('sel1', true, {
      role: UserRole.OPERATOR,
      userId: 'u1',
      direction: 'b',
    });
    expect(plcService.writeCoil).toHaveBeenCalledWith(26, false);
    expect(plcService.writeCoil).toHaveBeenCalledWith(27, true);

    plcService.writeCoil.mockClear();
    await service.activateCell('sel1', false, {
      role: UserRole.OPERATOR,
      userId: 'u1',
    });
    expect(plcService.writeCoil).toHaveBeenCalledWith(26, false);
    expect(plcService.writeCoil).toHaveBeenCalledWith(27, false);
  });

  it('blocks jog selectors when Enable is not held', async () => {
    cells.findOne.mockResolvedValue({
      ...motionCell,
      style: 'selector',
      secondaryRegister: {
        kind: 'coil',
        address: 27,
        name: 'coil.p03a21.di.owvaDown',
      },
    });
    safetyState.canIssueMotion.mockReturnValue(true);
    registers.findOneBy.mockResolvedValue({
      name: 'coil.p03a21.di.enable',
      kind: 'coil',
      address: 43,
    });
    plcService.getDriver.mockReturnValue({
      readCoils: jest.fn().mockResolvedValue([false]),
    });
    await expect(
      service.activateCell('c1', true, {
        role: UserRole.OPERATOR,
        userId: 'u1',
        direction: 'a',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects selector direction b without a secondary register', async () => {
    cells.findOne.mockResolvedValue({
      ...motionCell,
      style: 'selector',
      secondaryRegister: null,
    });
    safetyState.canIssueMotion.mockReturnValue(true);
    await expect(
      service.activateCell('c1', true, {
        role: UserRole.OPERATOR,
        userId: 'u1',
        direction: 'b',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('asserts selector direction a without a secondary register', async () => {
    cells.findOne.mockResolvedValue({
      ...motionCell,
      style: 'selector',
      secondaryRegister: null,
      variableSpeed: false,
    });
    safetyState.canIssueMotion.mockReturnValue(true);
    registers.findOneBy.mockResolvedValue(null);
    plcService.getDriver.mockReturnValue({});
    await service.activateCell('c1', true, {
      role: UserRole.OPERATOR,
      userId: 'u1',
      direction: 'a',
    });
    expect(plcService.writeCoil).toHaveBeenCalledWith(0, true);
  });

  it('releases one selector side when direction is provided', async () => {
    cells.findOne.mockResolvedValue({
      ...motionCell,
      style: 'selector',
      primaryRegister: {
        kind: 'coil',
        address: 26,
        name: 'coil.p03a21.di.owvaUp',
      },
      secondaryRegister: {
        kind: 'coil',
        address: 27,
        name: 'coil.p03a21.di.owvaDown',
      },
    });
    safetyState.canIssueMotion.mockReturnValue(true);
    registers.findOneBy.mockImplementation(async (q: { name?: string }) => {
      if (q.name === 'holding.speedPct') {
        return { name: q.name, kind: 'holding', address: 2 };
      }
      return null;
    });
    plcService.getDriver.mockReturnValue({});
    await service.activateCell('c1', false, {
      role: UserRole.OPERATOR,
      userId: 'u1',
      direction: 'a',
    });
    expect(plcService.writeCoil).toHaveBeenCalledWith(26, false);
    expect(plcService.writeCoil).not.toHaveBeenCalledWith(27, false);
  });

  it('centers a selector that only has a primary register', async () => {
    cells.findOne.mockResolvedValue({
      ...motionCell,
      style: 'selector',
      isMotion: false,
      variableSpeed: false,
      secondaryRegister: null,
    });
    plcService.getDriver.mockReturnValue({});
    await service.activateCell('c1', false, { role: UserRole.OPERATOR });
    expect(plcService.writeCoil).toHaveBeenCalledWith(0, false);
  });

  it('skips Enable gate when the enable register is missing', async () => {
    cells.findOne.mockResolvedValue({
      ...motionCell,
      style: 'selector',
      secondaryRegister: {
        kind: 'coil',
        address: 27,
        name: 'coil.p03a21.di.owvaDown',
      },
      variableSpeed: false,
    });
    safetyState.canIssueMotion.mockReturnValue(true);
    registers.findOneBy.mockResolvedValue(null);
    plcService.getDriver.mockReturnValue({});
    await service.activateCell('c1', true, {
      role: UserRole.OPERATOR,
      userId: 'u1',
      direction: 'a',
    });
    expect(plcService.writeCoil).toHaveBeenCalledWith(0, true);
  });

  it('asserts STOP in one press without a PIN', async () => {
    cells.findOne.mockResolvedValue({
      ...motionCell,
      id: 'stop',
      isMotion: false,
      requiresSafeAction: true,
      label: 'STOP',
      style: 'estop',
    });
    await service.activateCell('stop', true, { role: UserRole.OPERATOR });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(plcService.writeCoil).toHaveBeenCalled();
    expect(safetyState.latchOperatorEStop).toHaveBeenCalledWith('STOP: STOP');
    expect(auditService.write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'cell.activate',
        resource: 'STOP',
      }),
    );

    plcService.writeCoil.mockClear();
    const release = await service.activateCell('stop', false, {
      role: UserRole.OPERATOR,
    });
    expect(release).toEqual(
      expect.objectContaining({ latched: true, value: false }),
    );
    expect(plcService.writeCoil).not.toHaveBeenCalled();
  });

  it('writes holding.speedPct for slow vs fast motion jogs (FEAT-A2)', async () => {
    safetyState.canIssueMotion.mockReturnValue(true);
    registers.findOneBy.mockResolvedValue({
      name: 'holding.speedPct',
      kind: 'holding',
      address: 2,
    });
    await service.activateCell('c1', true, {
      role: UserRole.OPERATOR,
      speed: 'slow',
    });
    expect(plcService.writeHolding).toHaveBeenCalledWith(2, 30);
    expect(plcService.writeCoil).toHaveBeenCalledWith(0, true);

    plcService.writeHolding.mockClear();
    plcService.writeCoil.mockClear();
    await service.activateCell('c1', true, {
      role: UserRole.OPERATOR,
      speed: 'fast',
    });
    expect(plcService.writeHolding).toHaveBeenCalledWith(2, 100);

    plcService.writeHolding.mockClear();
    await service.activateCell('c1', false, { role: UserRole.OPERATOR });
    expect(plcService.writeHolding).toHaveBeenCalledWith(2, 0);
    expect(plcService.writeCoil).toHaveBeenCalledWith(0, false);

    // Defaults when variableSpeed / pct fields are missing on the row.
    cells.findOne.mockResolvedValue({
      ...motionCell,
      variableSpeed: undefined,
      slowSpeedPct: undefined,
      fastSpeedPct: undefined,
    });
    plcService.writeHolding.mockClear();
    await service.activateCell('c1', true, {
      role: UserRole.OPERATOR,
      speed: 'slow',
    });
    expect(plcService.writeHolding).toHaveBeenCalledWith(2, 30);

    // Same jog target as last write — skip the holding rewrite.
    plcService.writeHolding.mockClear();
    await service.activateCell('c1', true, {
      role: UserRole.OPERATOR,
      speed: 'slow',
    });
    expect(plcService.writeHolding).not.toHaveBeenCalled();

    // Skip speed writes when cell opts out.
    cells.findOne.mockResolvedValue({
      ...motionCell,
      variableSpeed: false,
    });
    plcService.writeHolding.mockClear();
    plcService.writeCoil.mockClear();
    await service.activateCell('c1', true, { role: UserRole.OPERATOR });
    expect(plcService.writeHolding).not.toHaveBeenCalled();
    expect(plcService.writeCoil).toHaveBeenCalledWith(0, true);

    // Ignore non-holding speed register maps.
    cells.findOne.mockResolvedValue(motionCell);
    registers.findOneBy.mockResolvedValue({
      name: 'holding.speedPct',
      kind: 'coil',
      address: 2,
    });
    plcService.writeHolding.mockClear();
    await service.activateCell('c1', true, {
      role: UserRole.OPERATOR,
      speed: 'fast',
    });
    expect(plcService.writeHolding).not.toHaveBeenCalled();
  });

  it('writes holding on/off and rejects read-only kinds', async () => {
    safetyState.canIssueMotion.mockReturnValue(true);
    cells.findOne.mockResolvedValue({
      ...motionCell,
      isMotion: false,
      variableSpeed: false,
      primaryRegister: { kind: 'holding', address: 5 },
    });
    await service.activateCell('c1', true, { role: UserRole.OPERATOR });
    expect(plcService.writeHolding).toHaveBeenCalledWith(5, 1);
    await service.activateCell('c1', false, { role: UserRole.OPERATOR });
    expect(plcService.writeHolding).toHaveBeenCalledWith(5, 0);

    cells.findOne.mockResolvedValue({
      ...motionCell,
      isMotion: false,
      primaryRegister: { kind: 'input', address: 9 },
    });
    await expect(
      service.activateCell('c1', true, { role: UserRole.OPERATOR }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    cells.findOne.mockResolvedValue({
      ...motionCell,
      isMotion: false,
      primaryRegister: { kind: 'discrete', address: 9 },
    });
    await expect(
      service.activateCell('c1', true, { role: UserRole.OPERATOR }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('updates a register address and drops the address cache', async () => {
    registers.findOneBy.mockResolvedValue({
      id: 'r1',
      name: 'coil.hoistUp',
      address: 0,
    });
    const saved = await service.updateRegister('r1', 20);
    expect(saved.address).toBe(20);
    expect(plcService.forgetAddresses).toHaveBeenCalled();
    expect(auditService.write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'register.update',
        details: 'coil.hoistUp=20',
      }),
    );
    const tagged = await service.updateRegister(
      'r1',
      21,
      { userEmail: 'admin@example.com' },
      { nodeId: ' ns=1;s=Hoist ', trended: true },
    );
    expect(tagged.nodeId).toBe('ns=1;s=Hoist');
    expect(tagged.trended).toBe(true);
    const cleared = await service.updateRegister(
      'r1',
      21,
      { userId: 'u1', ip: '127.0.0.1' },
      { nodeId: '  ', trended: false },
    );
    expect(cleared.nodeId).toBeNull();
    const untouched = await service.updateRegister('r1', 22, undefined, {
      nodeId: null,
    });
    expect(untouched.nodeId).toBeNull();
    const trendOnly = await service.updateRegister('r1', 23, undefined, {
      trended: true,
    });
    expect(trendOnly.address).toBe(23);
  });

  it('requires PIN to change a safety register address (TP-48)', async () => {
    registers.findOneBy.mockResolvedValue({
      id: 'estop-id',
      name: 'coil.eStop',
      address: 11,
    });
    await expect(
      service.updateRegister(
        'estop-id',
        99,
        { userId: 'u1', userEmail: 'sup@x' },
        { pin: 'wrong' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(auditService.write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'register.update_denied',
        result: 'failure',
      }),
    );

    registers.findOneBy.mockResolvedValue({
      id: 'estop-id',
      name: 'coil.eStop',
      address: 11,
    });
    const saved = await service.updateRegister(
      'estop-id',
      99,
      { userId: 'u1' },
      { pin: '1234' },
    );
    expect(saved.address).toBe(99);

    registers.findOneBy.mockResolvedValue({
      id: 'custom-bound',
      name: 'coil.other',
      address: 5,
    });
    for (const key of [
      'eStopRegisterId',
      'deadmanRegisterId',
      'heartbeatRegisterId',
      'safeStateRegisterId',
    ] as const) {
      safetyState.getRoles.mockResolvedValue({
        eStopRegisterId: null,
        deadmanRegisterId: null,
        heartbeatRegisterId: null,
        safeStateRegisterId: null,
        [key]: 'custom-bound',
      });
      await expect(
        service.updateRegister('custom-bound', 6, { userId: 'u1' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    }

    registers.findOneBy.mockResolvedValue({
      id: 'estop-id',
      name: 'coil.eStop',
      address: 11,
    });
    safeActionPin.verify.mockClear();
    await service.updateRegister(
      'estop-id',
      11,
      { userId: 'u1' },
      { trended: true },
    );
    expect(safeActionPin.verify).not.toHaveBeenCalled();
  });

  it('rejects a missing register and an address outside 0..65535', async () => {
    registers.findOneBy.mockResolvedValue(null);
    await expect(service.updateRegister('missing', 1)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.updateRegister('r1', -1)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.updateRegister('r1', 65536)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.updateRegister('r1', 1.5)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  const cellInput = {
    row: 1,
    col: 2,
    label: ' Spare ',
    style: ' default ',
    isMotion: false,
    requiresSafeAction: false,
    primaryRegisterId: 'p1',
    feedbackRegisterId: 'f1',
    statusRegisterId: 's1',
  };

  it('creates and updates cells with optional addresses', async () => {
    registers.findOneBy.mockImplementation(async ({ id }: { id: string }) => ({
      id,
      name: id,
    }));
    const created = await service.createCell(cellInput);
    expect(created.label).toBe('Spare');
    expect(created.id).toBe('new-cell');
    expect(auditService.write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'cell.create',
        resource: 'Spare',
      }),
    );

    await service.createCell({
      ...cellInput,
      feedbackRegisterId: '',
      statusRegisterId: null,
    });

    cells.findOne.mockResolvedValue({
      id: 'c9',
      label: 'Old',
      style: 'default',
      requiresSafeAction: false,
      primaryRegister: { name: 'coil.other' },
    });
    const updated = await service.updateCell('c9', cellInput);
    expect(updated.label).toBe('Spare');
    expect(auditService.write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'cell.update',
        resource: 'Spare',
      }),
    );
  });

  it('validates and clamps cell variable-speed percents (FEAT-A2)', async () => {
    registers.findOneBy.mockImplementation(async ({ id }: { id: string }) => ({
      id,
      name: id,
      kind: 'holding',
    }));
    const clamped = await service.createCell({
      ...cellInput,
      isMotion: true,
      variableSpeed: true,
      slowSpeedPct: 0,
      fastSpeedPct: 250,
    });
    expect(clamped.slowSpeedPct).toBe(1);
    expect(clamped.fastSpeedPct).toBe(100);

    const fallbacks = await service.createCell({
      ...cellInput,
      isMotion: true,
      slowSpeedPct: Number.NaN,
      fastSpeedPct: Number.POSITIVE_INFINITY,
    });
    expect(fallbacks.slowSpeedPct).toBe(30);
    expect(fallbacks.fastSpeedPct).toBe(100);

    await expect(
      service.createCell({
        ...cellInput,
        isMotion: true,
        slowSpeedPct: 80,
        fastSpeedPct: 40,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects selector cells without a secondary register', async () => {
    registers.findOneBy.mockImplementation(async ({ id }: { id: string }) => ({
      id,
      name: id,
    }));
    await expect(
      service.createCell({
        ...cellInput,
        style: 'selector',
        secondaryRegisterId: null,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a bad cell and a missing cell', async () => {
    registers.findOneBy.mockResolvedValue(null);
    await expect(service.createCell(cellInput)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      service.createCell({ ...cellInput, label: '  ', primaryRegisterId: 'p' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.createCell({ ...cellInput, row: 1.5, primaryRegisterId: 'p' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.createCell({ ...cellInput, col: 33, primaryRegisterId: 'p' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    cells.findOne.mockResolvedValue(null);
    await expect(
      service.updateCell('missing', cellInput),
    ).rejects.toBeInstanceOf(NotFoundException);
    cells.findOne.mockResolvedValue(null);
    await expect(service.deleteCell('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('refuses to demote or delete the STOP cell (TP-07)', async () => {
    registers.findOneBy.mockImplementation(async ({ id }: { id: string }) => ({
      id,
      name: id === 'estop' ? 'coil.eStop' : 'coil.hoistUp',
    }));
    cells.findOne.mockResolvedValue({
      id: 'stop',
      label: 'STOP',
      style: 'estop',
      requiresSafeAction: true,
      isMotion: false,
      primaryRegister: { name: 'coil.eStop' },
    });
    await expect(
      service.updateCell('stop', {
        row: 0,
        col: 0,
        label: 'Not STOP',
        style: 'motion',
        isMotion: true,
        requiresSafeAction: false,
        primaryRegisterId: 'hoist',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const kept = await service.updateCell('stop', {
      row: 1,
      col: 1,
      label: 'STOP',
      style: 'estop',
      isMotion: false,
      requiresSafeAction: true,
      primaryRegisterId: 'estop',
    });
    expect(kept.label).toBe('STOP');
    expect(auditService.write).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'cell.update' }),
    );
  });

  it('refuses to delete the STOP cell', async () => {
    cells.findOne.mockResolvedValueOnce({
      id: 'stop',
      label: 'STOP',
      requiresSafeAction: true,
      style: 'motion',
      primaryRegister: { name: 'coil.hoistUp' },
    });
    await expect(service.deleteCell('stop')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    cells.findOne.mockResolvedValueOnce({
      id: 'stop',
      label: 'Halt',
      requiresSafeAction: false,
      style: 'motion',
      primaryRegister: { name: 'coil.eStop' },
    });
    await expect(service.deleteCell('stop')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    cells.findOne.mockResolvedValueOnce({
      id: 'stop',
      label: 'Halt',
      requiresSafeAction: false,
      style: 'estop',
      primaryRegister: { name: 'coil.other' },
    });
    await expect(service.deleteCell('stop')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('deletes a cell and writes an overlay on the active background', async () => {
    cells.findOne.mockResolvedValue({
      id: 'c9',
      label: 'Spare',
      style: 'motion',
    });
    await expect(service.deleteCell('c9')).resolves.toEqual({ ok: true });

    registers.findOneBy.mockResolvedValue({ id: 'r', name: 'coil.eStop' });
    const created = await service.createOverlay({
      label: ' Estop ',
      xPct: 10,
      yPct: 20,
      format: ' {value} ',
      registerId: 'r',
    });
    expect(created.label).toBe('Estop');

    await service.createOverlay({
      label: 'Plain',
      xPct: 0,
      yPct: 100,
      format: '{value}',
      registerId: '  ',
    });

    overlays.findOneBy.mockResolvedValue({ id: 'o9', label: 'Estop' });
    await service.updateOverlay('o9', {
      label: 'Estop',
      xPct: 12,
      yPct: 8,
      format: '{value}',
      registerId: 'r',
    });
    await expect(service.deleteOverlay('o9')).resolves.toEqual({ ok: true });
  });

  it('rejects overlay and background mistakes', async () => {
    backgrounds.findOne.mockResolvedValue(null);
    await expect(
      service.createOverlay({
        label: 'H',
        xPct: 1,
        yPct: 1,
        format: '{value}',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    backgrounds.findOne.mockResolvedValue({ id: 'bg1', active: true });
    await expect(
      service.createOverlay({
        label: ' ',
        xPct: 1,
        yPct: 1,
        format: '{value}',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.createOverlay({
        label: 'H',
        xPct: -1,
        yPct: 1,
        format: '{value}',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.createOverlay({
        label: 'H',
        xPct: 1,
        yPct: 101,
        format: '{value}',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    overlays.findOneBy.mockResolvedValue(null);
    await expect(
      service.updateOverlay('nope', {
        label: 'H',
        xPct: 1,
        yPct: 1,
        format: '{value}',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.deleteOverlay('nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    const saved = await service.updateBackground({
      name: ' bay ',
      cssBackground: '  ',
      imageUrl: '',
    });
    expect(saved.name).toBe('bay');
    expect(saved.cssBackground).toBeNull();
    expect(saved.imageUrl).toBeNull();

    await service.updateBackground({
      name: 'bay',
      cssBackground: 'red',
      imageUrl: 'https://example.com/bay.png',
    });
    await expect(
      service.updateBackground({ name: '   ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates, lists, and activates plant screens', async () => {
    backgrounds.findOne.mockResolvedValueOnce(null);
    backgrounds.create.mockReturnValue({
      name: 'yard',
      active: false,
    });
    backgrounds.save.mockImplementation(async (row) => {
      const one = Array.isArray(row) ? row[0] : row;
      return { ...one, id: one.id ?? 'bg2' };
    });
    const created = await service.createBackground({ name: ' yard ' });
    expect(created.name).toBe('yard');
    expect(created.active).toBe(false);

    backgrounds.findOne.mockResolvedValueOnce({ id: 'bg1', name: 'demo' });
    await expect(
      service.createBackground({ name: 'demo' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.createBackground({ name: '  ' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    backgrounds.findOneBy.mockResolvedValueOnce(null);
    await expect(service.activateBackground('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    const other = { id: 'bg2', name: 'yard', active: false };
    const current = { id: 'bg1', name: 'demo-crane', active: true };
    backgrounds.findOneBy.mockResolvedValueOnce(other);
    backgrounds.find.mockResolvedValueOnce([current, other]);
    const activated = await service.activateBackground('bg2');
    expect(activated.active).toBe(true);
    expect(backgrounds.save).toHaveBeenCalled();
  });

  it('uploads a plant graphic asset onto the active screen', async () => {
    const prevDir = process.env.SQLITE_DIR;
    process.env.SQLITE_DIR = tmpdir();
    backgrounds.findOne.mockResolvedValue({
      id: 'bg1',
      name: 'demo-crane',
      active: true,
      imageUrl: null,
    });
    backgrounds.save.mockImplementation(async (row) =>
      Array.isArray(row) ? row : row,
    );

    await expect(
      service.uploadBackgroundAsset(undefined),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.uploadBackgroundAsset({
        buffer: Buffer.alloc(0),
        mimetype: 'image/png',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.uploadBackgroundAsset({
        buffer: Buffer.from('x'),
        mimetype: 'application/pdf',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.uploadBackgroundAsset({
        buffer: Buffer.alloc(2_000_001),
        mimetype: 'image/png',
        size: 2_000_001,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const saved = await service.uploadBackgroundAsset({
      buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
      mimetype: 'image/svg+xml',
    });
    expect(saved.imageUrl).toMatch(/^\/hmi-assets\/.+\.svg$/);

    if (prevDir === undefined) delete process.env.SQLITE_DIR;
    else process.env.SQLITE_DIR = prevDir;
  });
});
