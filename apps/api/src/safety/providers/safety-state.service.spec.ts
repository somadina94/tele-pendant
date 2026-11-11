import { ControlLeaseService } from './control-lease.service';
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

  const safeActionPin = {
    verify: jest.fn(async (_userId: string | undefined, pin: string) => {
      const expected = (process.env.SAFE_ACTION_PIN || '').trim();
      return Boolean(expected && pin.trim() === expected);
    }),
  };

  let service: SafetyStateService;
  let controlLease: ControlLeaseService;

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
    safeActionPin.verify.mockImplementation(
      async (_userId: string | undefined, pin: string) => {
        const expected = (process.env.SAFE_ACTION_PIN || '').trim();
        return Boolean(expected && pin.trim() === expected);
      },
    );
    controlLease = new ControlLeaseService();
    service = new SafetyStateService(
      plcService as never,
      auditService as never,
      cells as never,
      registers as never,
      roles as never,
      safeActionPin as never,
      controlLease,
    );
  });

  function clientFor(userId: string): string {
    return `${userId}-client`;
  }

  function claimAs(userId: string, name = userId): void {
    service.claimControl(userId, name, undefined, clientFor(userId));
  }

  function pulseHeld(userId = 'u1', socketId?: string): void {
    if (!controlLease.holds(userId, clientFor(userId))) claimAs(userId);
    service.pulseDeadman({
      userId,
      socketId,
      clientId: clientFor(userId),
    });
  }

  it('stores the timed-motion flag and reads it back', async () => {
    process.env.SAFE_ACTION_PIN = '1234';
    roles.find.mockResolvedValueOnce([]);
    registers.findOneBy.mockImplementation(async ({ id }: { id: string }) => {
      if (id === 'reg-estop') return { id, name: 'coil.eStop' };
      return null;
    });
    await service.saveRoles(
      {
        allowTimedMediaMotion: true,
        eStopRegisterId: 'reg-estop',
        pin: '1234',
      },
      { userEmail: 'admin@x' },
    );
    expect(service.snapshot().allowTimedMediaMotion).toBe(true);
    expect(auditService.write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'safety.roles_update',
        result: 'success',
        details: expect.stringContaining('eStop=coil.eStop'),
      }),
    );
    roles.find.mockResolvedValueOnce([
      { id: 'role-1', allowTimedMediaMotion: false },
    ]);
    await expect(service.allowTimedMediaMotion()).resolves.toBe(false);
    roles.find.mockResolvedValueOnce([
      { id: 'role-1', allowTimedMediaMotion: true },
    ]);
    await expect(service.allowTimedMediaMotion()).resolves.toBe(true);
    delete process.env.SAFE_ACTION_PIN;
  });

  it('rejects safety role saves with a wrong PIN and audits denial (TP-42)', async () => {
    process.env.SAFE_ACTION_PIN = '1234';
    await expect(
      service.saveRoles(
        { allowTimedMediaMotion: true, pin: 'wrong' },
        { userEmail: 'sup@x' },
      ),
    ).rejects.toThrow('PIN does not match');
    expect(auditService.write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'safety.roles_denied',
        result: 'failure',
      }),
    );
    expect(roles.save).not.toHaveBeenCalled();
    delete process.env.SAFE_ACTION_PIN;
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

  it('blocks motion until deadman pulse and releases', async () => {
    claimAs('u1', 'Alice');
    expect(service.canIssueMotion('u1', clientFor('u1'))).toBe(false);
    service.pulseDeadman({ userId: 'u1', clientId: clientFor('u1') });
    expect(service.canIssueMotion('u1', clientFor('u1'))).toBe(true);
    expect(service.canIssueMotion('u2', clientFor('u2'))).toBe(false);
    await service.releaseDeadman({ userId: 'u1' });
    expect(service.canIssueMotion('u1', clientFor('u1'))).toBe(false);
    expect(service.snapshot().lastClientPulseAt).toBeNull();
  });

  it('ignores deadman pulse without exclusive control (FEAT-A5)', () => {
    service.pulseDeadman({ userId: 'u1', clientId: clientFor('u1') });
    expect(service.snapshot().deadmanActive).toBe(false);
    expect(service.canIssueMotion('u1', clientFor('u1'))).toBe(false);
    service.pulseDeadman({
      userId: 'u1',
      socketId: 'sock-a',
      clientId: clientFor('u1'),
    });
    expect(service.snapshot().deadmanActive).toBe(false);
    claimAs('u1', 'Alice');
    service.pulseDeadman({ userId: 'u1', clientId: clientFor('u1') });
    expect(service.canIssueMotion('u1', clientFor('u1'))).toBe(true);
    expect(service.canIssueMotion('u2', clientFor('u2'))).toBe(false);
  });

  it('steals control with PIN and drops prior deadman (FEAT-A5)', async () => {
    process.env.SAFE_ACTION_PIN = '1234';
    claimAs('u1', 'Alice');
    service.pulseDeadman({ userId: 'u1', clientId: clientFor('u1') });
    expect(service.canIssueMotion('u1', clientFor('u1'))).toBe(true);
    await expect(
      service.stealControl(
        'wrong',
        'u2',
        'Bob',
        { userEmail: 'bob@x' },
        clientFor('u2'),
      ),
    ).rejects.toThrow('PIN does not match');
    const control = await service.stealControl(
      '1234',
      'u2',
      'Bob',
      {
        userEmail: 'bob@x',
      },
      clientFor('u2'),
    );
    expect(control.youHold).toBe(true);
    expect(service.snapshot().deadmanActive).toBe(false);
    expect(service.canIssueMotion('u1', clientFor('u1'))).toBe(false);
    service.pulseDeadman({ userId: 'u2', clientId: clientFor('u2') });
    expect(service.canIssueMotion('u2', clientFor('u2'))).toBe(true);
    delete process.env.SAFE_ACTION_PIN;
  });

  it('heartbeats and releases exclusive control (FEAT-A5)', () => {
    claimAs('u1', 'Alice');
    expect(service.controlSnapshot('u1', clientFor('u1')).youHold).toBe(true);
    expect(service.heartbeatControl('u1', clientFor('u1')).youHold).toBe(true);
    expect(
      service.releaseControl('u1', { userEmail: 'a@x' }, clientFor('u1')).held,
    ).toBe(false);
    expect(service.controlSnapshot('u1', clientFor('u1')).held).toBe(false);
    expect(auditService.write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'safety.control_release',
        result: 'success',
      }),
    );
  });

  it('steals when control is free (no prior holder deadman drop)', async () => {
    process.env.SAFE_ACTION_PIN = '1234';
    const control = await service.stealControl(
      '1234',
      'u1',
      'Alice',
      undefined,
      clientFor('u1'),
    );
    expect(control.youHold).toBe(true);
    expect(auditService.write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'safety.control_steal',
        details: undefined,
        result: 'success',
      }),
    );
    delete process.env.SAFE_ACTION_PIN;
  });

  it('ignores empty pulse and non-holder release (TP-37)', async () => {
    claimAs('u1', 'Alice');
    service.pulseDeadman({ userId: '  ', clientId: clientFor('  ') });
    expect(service.snapshot().deadmanActive).toBe(false);
    service.pulseDeadman({
      userId: 'u1',
      socketId: 'sock-a',
      clientId: clientFor('u1'),
    });
    expect(service.canIssueMotion('u1', clientFor('u1'))).toBe(true);
    await service.releaseDeadman({ userId: 'u2' });
    expect(service.snapshot().deadmanActive).toBe(true);
    await service.releaseDeadman({ socketId: 'sock-other' });
    expect(service.snapshot().deadmanActive).toBe(true);
    await service.releaseDeadman({ socketId: 'sock-a' });
    expect(service.snapshot().deadmanActive).toBe(false);
    service.pulseDeadman({
      userId: 'u1',
      socketId: 'sock-a',
      clientId: clientFor('u1'),
    });
    await service.releaseDeadman({ force: true });
    expect(service.snapshot().deadmanActive).toBe(false);
  });

  it('keeps deadman across socket flap; HTTP pulse preserves socket binding', () => {
    claimAs('u1', 'Alice');
    service.pulseDeadman({
      userId: 'u1',
      socketId: 'sock-a',
      clientId: clientFor('u1'),
    });
    expect(service.canIssueMotion('u1', clientFor('u1'))).toBe(true);
    service.noteSocketDisconnect('sock-a');
    expect(service.canIssueMotion('u1', clientFor('u1'))).toBe(true);
    service.pulseDeadman({ userId: 'u1', clientId: clientFor('u1') }); // HTTP — no socketId
    service.noteSocketDisconnect('sock-other');
    expect(service.canIssueMotion('u1', clientFor('u1'))).toBe(true);
  });

  it('aborts an in-flight coil drop when a newer pulse arrives', async () => {
    cells.find.mockResolvedValue([
      { primaryRegister: { kind: 'coil', address: 7 } },
    ]);
    claimAs('u1', 'Alice');
    service.pulseDeadman({
      userId: 'u1',
      socketId: 'sock-a',
      clientId: clientFor('u1'),
    });
    let resolveDeadmanWrite: (() => void) | undefined;
    const deadmanWriteGate = new Promise<void>((resolve) => {
      resolveDeadmanWrite = resolve;
    });
    driver.writeCoil.mockImplementation(
      async (addr: number, value: boolean) => {
        if (addr === 10 && value === false) {
          await deadmanWriteGate;
        }
      },
    );
    const releasePromise = service.releaseDeadman({ userId: 'u1' });
    // Mid-drop: operator still holding — pulse cancels the clear.
    await Promise.resolve();
    service.pulseDeadman({
      userId: 'u1',
      socketId: 'sock-a',
      clientId: clientFor('u1'),
    });
    resolveDeadmanWrite?.();
    await releasePromise;
    driver.writeCoil.mockClear();
    await service.tick();
    // Deadman stays active; tick should re-assert deadman coil true, not clear motion.
    expect(service.snapshot().deadmanActive).toBe(true);
    expect(driver.writeCoil).toHaveBeenCalledWith(10, true);
    expect(driver.writeCoil).not.toHaveBeenCalledWith(7, false);
  });

  it('aborts after motion coils clear when a newer pulse arrives', async () => {
    cells.find.mockResolvedValue([
      { primaryRegister: { kind: 'coil', address: 7 } },
    ]);
    claimAs('u1', 'Alice');
    service.pulseDeadman({
      userId: 'u1',
      socketId: 'sock-a',
      clientId: clientFor('u1'),
    });
    let resolveMotionWrite: (() => void) | undefined;
    const motionWriteGate = new Promise<void>((resolve) => {
      resolveMotionWrite = resolve;
    });
    let motionWriteStarted = false;
    driver.writeCoil.mockImplementation(
      async (addr: number, value: boolean) => {
        if (addr === 7 && value === false) {
          motionWriteStarted = true;
          await motionWriteGate;
        }
      },
    );
    const releasePromise = service.releaseDeadman({ userId: 'u1' });
    for (let i = 0; i < 20 && !motionWriteStarted; i += 1) {
      await Promise.resolve();
    }
    expect(motionWriteStarted).toBe(true);
    // Pulse after clearMotionCoils has begun so the post-clear abort path runs.
    service.pulseDeadman({
      userId: 'u1',
      socketId: 'sock-a',
      clientId: clientFor('u1'),
    });
    resolveMotionWrite?.();
    await releasePromise;
    expect(service.snapshot().deadmanActive).toBe(true);
    driver.writeCoil.mockClear();
    await service.tick();
    expect(driver.writeCoil).toHaveBeenCalledWith(10, true);
  });

  it('ignores unrelated socket disconnects and empty ids', () => {
    claimAs('u1', 'Alice');
    service.pulseDeadman({
      userId: 'u1',
      socketId: 'sock-a',
      clientId: clientFor('u1'),
    });
    service.noteSocketDisconnect('');
    service.noteSocketDisconnect('sock-other');
    expect(service.canIssueMotion('u1', clientFor('u1'))).toBe(true);
  });

  it('on release writes deadman coil off and clears motion coils (TP-35)', async () => {
    cells.find.mockResolvedValue([
      { primaryRegister: { kind: 'coil', address: 7 } },
      { primaryRegister: { kind: 'holding', address: 8 } },
    ]);
    pulseHeld();
    await service.tick();
    driver.writeCoil.mockClear();
    await service.releaseDeadman({ userId: 'u1' });
    // Drop is fire-and-forget so the WS/HTTP response is not Modbus-bound.
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(service.canIssueMotion('u1', clientFor('u1'))).toBe(false);
    expect(service.snapshot().lastClientPulseAt).toBeNull();
    // DEMO_CRANE_MAP.coils.deadman is 10
    expect(driver.writeCoil).toHaveBeenCalledWith(10, false);
    expect(driver.writeCoil).toHaveBeenCalledWith(7, false);
    expect(driver.writeCoil).not.toHaveBeenCalledWith(8, false);
  });

  it('clears asserted motion coils on release without scanning all cells', async () => {
    cells.find.mockClear();
    pulseHeld();
    service.noteMotionCoilAsserted(42);
    service.noteMotionCoilAsserted(Number.NaN);
    service.noteMotionCoilCleared(999);
    driver.writeCoil.mockClear();
    await service.releaseDeadman({ userId: 'u1' });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(driver.writeCoil).toHaveBeenCalledWith(10, false);
    expect(driver.writeCoil).toHaveBeenCalledWith(42, false);
    expect(cells.find).not.toHaveBeenCalled();
  });

  it('clears selector secondary coils when the asserted set is empty', async () => {
    cells.find.mockResolvedValue([
      {
        isMotion: true,
        primaryRegister: { kind: 'coil', address: 26 },
        secondaryRegister: { kind: 'coil', address: 27 },
      },
    ]);
    driver.writeCoil.mockClear();
    await service.latchOperatorEStop('Operator STOP');
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(driver.writeCoil).toHaveBeenCalledWith(26, false);
    expect(driver.writeCoil).toHaveBeenCalledWith(27, false);
  });

  it('retries PLC drop on next tick if release write failed', async () => {
    cells.find.mockResolvedValue([
      { primaryRegister: { kind: 'coil', address: 7 } },
    ]);
    pulseHeld();
    driver.writeCoil
      .mockRejectedValueOnce(new Error('link down'))
      .mockResolvedValue(undefined);
    await service.releaseDeadman({ userId: 'u1' });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(service.canIssueMotion('u1', clientFor('u1'))).toBe(false);
    driver.writeCoil.mockClear();
    await service.tick();
    expect(driver.writeCoil).toHaveBeenCalledWith(10, false);
    expect(driver.writeCoil).toHaveBeenCalledWith(7, false);
  });

  it('release returns early when PLC is disconnected', async () => {
    driver.isConnected.mockReturnValue(false);
    pulseHeld();
    driver.writeCoil.mockClear();
    await service.releaseDeadman({ userId: 'u1' });
    expect(service.canIssueMotion('u1', clientFor('u1'))).toBe(false);
    expect(driver.writeCoil).not.toHaveBeenCalled();
  });

  it('keeps needsMotionDrop when drop fails with a non-Error', async () => {
    cells.find.mockResolvedValue([
      { primaryRegister: { kind: 'coil', address: 7 } },
    ]);
    pulseHeld();
    driver.writeCoil.mockRejectedValueOnce('boom');
    await service.releaseDeadman({ userId: 'u1' });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(service.canIssueMotion('u1', clientFor('u1'))).toBe(false);
    driver.writeCoil.mockReset();
    driver.writeCoil.mockResolvedValue(undefined);
    await service.tick();
    expect(driver.writeCoil).toHaveBeenCalledWith(10, false);
    expect(driver.writeCoil).toHaveBeenCalledWith(7, false);
  });

  it('ignores a second release after deadman is already clear', async () => {
    pulseHeld();
    await service.releaseDeadman({ userId: 'u1' });
    await new Promise<void>((resolve) => setImmediate(resolve));
    driver.writeCoil.mockClear();
    await service.releaseDeadman({ userId: 'u1' });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(driver.writeCoil).not.toHaveBeenCalled();
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

  it('enters comms_lost when disconnected after consecutive fails', async () => {
    driver.isConnected.mockReturnValue(false);
    await service.tick();
    await service.tick();
    const snap = await service.tick();
    expect(snap.mode).toBe('comms_lost');
  });

  it('keeps software e-stop across PLC disconnect and reconnect until PIN (TP-39)', async () => {
    process.env.SAFE_ACTION_PIN = '1234';
    await service.latchOperatorEStop('Operator STOP');
    expect(service.snapshot().eStopActive).toBe(true);

    driver.isConnected.mockReturnValue(false);
    await service.tick();
    await service.tick();
    const lost = await service.tick();
    expect(lost.mode).toBe('comms_lost');
    expect(lost.eStopActive).toBe(true);

    driver.isConnected.mockReturnValue(true);
    driver.readCoils.mockResolvedValue([false]);
    const back = await service.tick();
    expect(back.mode).toBe('e_stop');
    expect(back.eStopActive).toBe(true);
    expect(service.canIssueMotion('u1', clientFor('u1'))).toBe(false);

    const reset = await service.resetEStop('1234');
    expect(reset.eStopActive).toBe(false);
    expect(reset.mode).toBe('normal');
    delete process.env.SAFE_ACTION_PIN;
  });

  it('restores normal after non-normal mode when healthy', async () => {
    driver.isConnected.mockReturnValue(false);
    await service.tick();
    await service.tick();
    await service.tick();
    expect(service.snapshot().mode).toBe('comms_lost');
    driver.isConnected.mockReturnValue(true);
    driver.readCoils.mockResolvedValue([false]);
    const snap = await service.tick();
    expect(snap.mode).toBe('normal');
  });

  it('writes heartbeat and deadman coil while active', async () => {
    pulseHeld();
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
    pulseHeld();
    jest.setSystemTime(now + 7000);
    await service.tick();
    expect(service.snapshot().deadmanActive).toBe(false);
    expect(driver.writeCoil).toHaveBeenCalledWith(expect.any(Number), false);
  });

  it('unbinds socket on flap; deadman expires on pulse timeout', async () => {
    jest.useFakeTimers();
    const now = Date.now();
    jest.setSystemTime(now);
    claimAs('u1', 'Alice');
    service.pulseDeadman({
      userId: 'u1',
      socketId: 'sock-a',
      clientId: clientFor('u1'),
    });
    service.noteSocketDisconnect('sock-a');
    jest.setSystemTime(now + 2000);
    await service.tick();
    expect(service.snapshot().deadmanActive).toBe(true);
    jest.setSystemTime(now + 2600);
    await service.tick();
    expect(service.snapshot().deadmanActive).toBe(false);
  });

  it('enters comms_lost only after consecutive tick read failures', async () => {
    driver.readCoils.mockRejectedValue(new Error('timeout'));
    const first = await service.tick();
    expect(first.mode).toBe('normal');
    expect(first.watchdogOk).toBe(false);
    await service.tick();
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

  it('handles non-Error throw in tick catch after consecutive fails', async () => {
    driver.readCoils.mockRejectedValue('boom');
    await service.tick();
    await service.tick();
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
    pulseHeld();
    jest.useFakeTimers();
    const now = Date.now();
    jest.setSystemTime(now);
    pulseHeld();
    jest.setSystemTime(now + 7000);
    await service.tick();
    expect(driver.writeCoil).toHaveBeenCalledWith(7, false);
    process.env.SAFE_ACTION_PIN = '1234';
    await service.saveRoles({
      eStopRegisterId: '',
      deadmanRegisterId: '',
      heartbeatRegisterId: '',
      safeStateRegisterId: '',
      pin: '1234',
    });
    const saved = await service.saveRoles({
      eStopRegisterId: 'estop',
      deadmanRegisterId: 'dead',
      heartbeatRegisterId: 'beat',
      safeStateRegisterId: 'safe',
      pin: '1234',
    });
    expect(saved.eStopRegisterId).toBe('estop');
    delete process.env.SAFE_ACTION_PIN;
    roles.find.mockResolvedValue([]);
    const created = await service.getRoles();
    expect(created.id).toBe('role-1');
  });
});
