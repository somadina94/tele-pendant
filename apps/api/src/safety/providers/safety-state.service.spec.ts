import { SafetyStateService } from './safety-state.service';

describe('SafetyStateService', () => {
  const driver = {
    isConnected: jest.fn().mockReturnValue(true),
    readCoils: jest.fn().mockResolvedValue([false]),
    writeRegister: jest.fn().mockResolvedValue(undefined),
    writeCoil: jest.fn().mockResolvedValue(undefined),
  };
  const plcService = {
    getDriver: () => driver,
    addressFor: jest.fn(async (_name: string, fallback: number) => fallback),
  };
  const auditService = {
    write: jest.fn().mockResolvedValue({}),
  };
  const cells = {
    find: jest.fn().mockResolvedValue([]),
  };
  const registers = {
    findOneBy: jest.fn().mockResolvedValue(null),
  };
  const roles = {
    find: jest.fn().mockResolvedValue([]),
    create: jest.fn((value: Record<string, unknown>) => ({ ...value })),
    save: jest.fn(async (value: Record<string, unknown>) => ({
      id: 'role-1',
      ...value,
    })),
  };

  let service: SafetyStateService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    driver.isConnected.mockReturnValue(true);
    driver.readCoils.mockResolvedValue([false]);
    driver.writeRegister.mockResolvedValue(undefined);
    driver.writeCoil.mockResolvedValue(undefined);
    cells.find.mockResolvedValue([]);
    registers.findOneBy.mockResolvedValue(null);
    roles.find.mockResolvedValue([]);
    service = new SafetyStateService(
      plcService as never,
      auditService as never,
      cells as never,
      registers as never,
      roles as never,
    );
  });

  it('stores the timed-motion flag and reads it back', async () => {
    roles.find.mockResolvedValueOnce([]);
    await service.saveRoles({ allowTimedMediaMotion: true });
    expect(service.snapshot().allowTimedMediaMotion).toBe(true);
    roles.find.mockResolvedValueOnce([
      { id: 'role-1', allowTimedMediaMotion: false },
    ]);
    await expect(service.allowTimedMediaMotion()).resolves.toBe(false);
    roles.find.mockResolvedValueOnce([
      { id: 'role-1', allowTimedMediaMotion: true },
    ]);
    await expect(service.allowTimedMediaMotion()).resolves.toBe(true);
  });

  it('resets e-stop only when the PIN matches', async () => {
    process.env.SAFE_ACTION_PIN = '1234';
    await expect(
      service.resetEStop('nope', { userEmail: 'a@b.c' }),
    ).rejects.toThrow('PIN does not match');
    delete process.env.SAFE_ACTION_PIN;
    await expect(service.resetEStop('1234')).rejects.toThrow(
      'PIN does not match',
    );
    process.env.SAFE_ACTION_PIN = '1234';
    await expect(service.resetEStop('   ')).rejects.toThrow(
      'PIN does not match',
    );
    driver.isConnected.mockReturnValue(false);
    (service as unknown as { mode: string }).mode = 'normal';
    const disconnected = await service.resetEStop('1234');
    expect(disconnected.mode).toBe('normal');
    expect(driver.writeCoil).not.toHaveBeenCalled();
    driver.isConnected.mockReturnValue(true);
    (service as unknown as { mode: string }).mode = 'e_stop';
    const reset = await service.resetEStop(' 1234 ', { userEmail: 'a@b.c' });
    expect(reset.mode).toBe('normal');
    expect(reset.eStopActive).toBe(false);
    expect(driver.writeCoil).toHaveBeenCalledWith(11, false);
    delete process.env.SAFE_ACTION_PIN;
  });

  it('blocks motion until deadman pulse and releases', () => {
    expect(service.canIssueMotion()).toBe(false);
    service.pulseDeadman();
    expect(service.canIssueMotion()).toBe(true);
    service.releaseDeadman();
    expect(service.canIssueMotion()).toBe(false);
    expect(service.snapshot().lastClientPulseAt).toBeNull();
  });

  it('enters e_stop when coil is high and is idempotent', async () => {
    driver.readCoils.mockResolvedValue([true]);
    const snap = await service.tick();
    expect(snap.mode).toBe('e_stop');
    expect(snap.eStopActive).toBe(true);
    expect(auditService.write).toHaveBeenCalled();
    const writes = auditService.write.mock.calls.length;
    await service.tick();
    expect(auditService.write.mock.calls.length).toBe(writes);
  });

  it('keeps e_stop latched when the coil drops before reset', async () => {
    driver.readCoils.mockResolvedValueOnce([true]);
    await service.tick();
    driver.readCoils.mockResolvedValue([false]);
    const snap = await service.tick();
    expect(snap.mode).toBe('e_stop');
    expect(snap.eStopActive).toBe(true);
  });

  it('latches operator STOP without waiting for the poller', async () => {
    const snap = await service.latchOperatorEStop();
    expect(snap.mode).toBe('e_stop');
    expect(snap.eStopActive).toBe(true);
  });

  it('enters comms_lost when disconnected', async () => {
    driver.isConnected.mockReturnValue(false);
    const snap = await service.tick();
    expect(snap.mode).toBe('comms_lost');
  });

  it('restores normal after non-normal mode when healthy', async () => {
    driver.isConnected.mockReturnValue(false);
    await service.tick();
    expect(service.snapshot().mode).toBe('comms_lost');
    driver.isConnected.mockReturnValue(true);
    driver.readCoils.mockResolvedValue([false]);
    const snap = await service.tick();
    expect(snap.mode).toBe('normal');
  });

  it('writes heartbeat and deadman coil while active', async () => {
    service.pulseDeadman();
    const snap = await service.tick();
    expect(snap.mode).toBe('normal');
    expect(driver.writeRegister).toHaveBeenCalled();
    expect(driver.writeCoil).toHaveBeenCalledWith(expect.any(Number), true);
    expect(snap.lastHeartbeatAt).not.toBeNull();
  });

  it('expires deadman and clears motion coils', async () => {
    jest.useFakeTimers();
    const now = Date.now();
    jest.setSystemTime(now);
    service.pulseDeadman();
    jest.setSystemTime(now + 5000);
    await service.tick();
    expect(service.snapshot().deadmanActive).toBe(false);
    expect(driver.writeCoil).toHaveBeenCalledWith(expect.any(Number), false);
  });

  it('enters comms_lost on tick read failure', async () => {
    driver.readCoils.mockRejectedValue(new Error('timeout'));
    const snap = await service.tick();
    expect(snap.mode).toBe('comms_lost');
    expect(snap.watchdogOk).toBe(false);
  });

  it('swallows safe-state write failures', async () => {
    driver.readCoils.mockResolvedValue([true]);
    driver.writeCoil.mockRejectedValue(new Error('write fail'));
    const snap = await service.tick();
    expect(snap.mode).toBe('e_stop');
  });

  it('handles non-Error throw in tick catch', async () => {
    driver.readCoils.mockRejectedValue('boom');
    const snap = await service.tick();
    expect(snap.mode).toBe('comms_lost');
  });

  it('covers safe_state entry, normal audit success, clearMotion early-return', async () => {
    const priv = service as unknown as {
      enterMode: (m: string, r: string) => Promise<void>;
    };
    const enter = (m: string, r: string) => priv.enterMode(m, r);
    await enter('safe_state', 'test');
    expect(service.snapshot().mode).toBe('safe_state');

    await enter('normal', 'recovered');
    expect(service.snapshot().mode).toBe('normal');
    expect(auditService.write).toHaveBeenCalledWith(
      expect.objectContaining({ result: 'success' }),
    );

    let calls = 0;
    driver.isConnected.mockImplementation(() => {
      calls += 1;
      return calls === 1;
    });
    await enter('e_stop', 'flip');
    expect(service.snapshot().mode).toBe('e_stop');
  });

  it('uses configured role registers and clears motion coils', async () => {
    roles.find.mockResolvedValue([
      {
        eStopRegisterId: 'estop',
        deadmanRegisterId: 'dead',
        heartbeatRegisterId: 'missing',
        safeStateRegisterId: null,
      },
    ]);
    registers.findOneBy.mockImplementation(async ({ id }: { id: string }) =>
      id === 'missing' ? null : { id, address: 40 },
    );
    cells.find.mockResolvedValue([
      { primaryRegister: { kind: 'coil', address: 7 } },
      { primaryRegister: { kind: 'holding', address: 8 } },
      { primaryRegister: null },
    ]);
    service.pulseDeadman();
    jest.useFakeTimers();
    const now = Date.now();
    jest.setSystemTime(now);
    service.pulseDeadman();
    jest.setSystemTime(now + 5000);
    await service.tick();
    expect(driver.writeCoil).toHaveBeenCalledWith(7, false);
    await service.saveRoles({
      eStopRegisterId: '',
      deadmanRegisterId: '',
      heartbeatRegisterId: '',
      safeStateRegisterId: '',
    });
    const saved = await service.saveRoles({
      eStopRegisterId: 'estop',
      deadmanRegisterId: 'dead',
      heartbeatRegisterId: 'beat',
      safeStateRegisterId: 'safe',
    });
    expect(saved.eStopRegisterId).toBe('estop');
    roles.find.mockResolvedValue([]);
    const created = await service.getRoles();
    expect(created.id).toBe('role-1');
  });
});
