import { ForbiddenException, NotFoundException } from '@nestjs/common';
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
  };
  const registers = {
    find: jest.fn().mockResolvedValue([{ name: 'coil.hoistUp' }]),
  };
  const backgrounds = {
    findOne: jest.fn().mockResolvedValue({ id: 'bg1', active: true }),
  };
  const overlays = {
    find: jest.fn().mockResolvedValue([{ id: 'o1', text: 'H' }]),
  };
  const plcService = {
    writeCoil: jest.fn().mockResolvedValue(undefined),
    writeHolding: jest.fn().mockResolvedValue(undefined),
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
});
