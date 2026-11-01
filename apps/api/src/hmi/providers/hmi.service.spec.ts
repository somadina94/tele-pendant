import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { HmiService } from './hmi.service';
import { UserRole } from '../../users/enums/user-role.enum';

describe('HmiService', () => {
  const motionCell = {
    id: 'c1',
    label: 'Hoist Up',
    isMotion: true,
    requiresSafeAction: false,
    primaryRegister: { kind: 'coil', address: 0 },
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
    findOne: jest.fn().mockResolvedValue({ id: 'bg1', active: true }),
    save: jest.fn(async (row: { id: string }) => row),
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
  };
  const safetyState = {
    canIssueMotion: jest.fn().mockReturnValue(false),
    snapshot: jest.fn().mockReturnValue({ mode: 'normal' }),
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
    backgrounds.findOne.mockResolvedValue({ id: 'bg1', active: true });
    safetyState.canIssueMotion.mockReturnValue(false);
    service = new HmiService(
      cells as never,
      registers as never,
      backgrounds as never,
      overlays as never,
      plcService as never,
      safetyState as never,
      auditService as never,
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
      userEmail: 'op@example.com',
    });
    expect(plcService.writeCoil).toHaveBeenCalledWith(0, true);
    expect(result.ok).toBe(true);
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

  it('requires safe-action PIN and rejects operators', async () => {
    const stop = {
      ...motionCell,
      id: 'stop',
      isMotion: false,
      requiresSafeAction: true,
      label: 'STOP',
    };
    cells.findOne.mockResolvedValue(stop);

    await expect(
      service.activateCell('stop', true, { role: UserRole.SUPERVISOR }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(auditService.write).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'cell.safe_action_denied' }),
    );

    await expect(
      service.activateCell('stop', true, {
        role: UserRole.OPERATOR,
        safeActionPin: '1234',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await service.activateCell('stop', true, {
      role: UserRole.SUPERVISOR,
      safeActionPin: '1234',
    });
    expect(plcService.writeCoil).toHaveBeenCalled();
  });

  it('falls back to ADMIN_PASSWORD for safe action', async () => {
    delete process.env.SAFE_ACTION_PIN;
    process.env.ADMIN_PASSWORD = 'admin-pin';
    cells.findOne.mockResolvedValue({
      ...motionCell,
      isMotion: false,
      requiresSafeAction: true,
    });
    await service.activateCell('c1', true, {
      role: UserRole.ADMIN,
      safeActionPin: 'admin-pin',
    });
    expect(plcService.writeCoil).toHaveBeenCalled();
  });

  it('uses empty expected pin when env unset', async () => {
    delete process.env.SAFE_ACTION_PIN;
    delete process.env.ADMIN_PASSWORD;
    cells.findOne.mockResolvedValue({
      ...motionCell,
      isMotion: false,
      requiresSafeAction: true,
    });
    await expect(
      service.activateCell('c1', true, {
        role: UserRole.ADMIN,
        safeActionPin: '',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('writes holding on/off and rejects read-only kinds', async () => {
    safetyState.canIssueMotion.mockReturnValue(true);
    cells.findOne.mockResolvedValue({
      ...motionCell,
      isMotion: false,
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
      name: 'coil.eStop',
      address: 11,
    });
    const saved = await service.updateRegister('r1', 20);
    expect(saved.address).toBe(20);
    expect(plcService.forgetAddresses).toHaveBeenCalled();
    expect(auditService.write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'register.update',
        details: 'coil.eStop=20',
      }),
    );
    const tagged = await service.updateRegister(
      'r1',
      21,
      { userEmail: 'admin@example.com' },
      { nodeId: ' ns=1;s=EStop ', trended: true },
    );
    expect(tagged.nodeId).toBe('ns=1;s=EStop');
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

    await service.createCell({
      ...cellInput,
      feedbackRegisterId: '',
      statusRegisterId: null,
    });

    cells.findOneBy.mockResolvedValue({ id: 'c9', label: 'Old' });
    const updated = await service.updateCell('c9', cellInput);
    expect(updated.label).toBe('Spare');
    expect(auditService.write).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'cell.update' }),
    );
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

    cells.findOneBy.mockResolvedValue(null);
    await expect(service.updateCell('missing', cellInput)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.deleteCell('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('deletes a cell and writes an overlay on the active background', async () => {
    cells.findOneBy.mockResolvedValue({ id: 'c9', label: 'Spare' });
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
});
