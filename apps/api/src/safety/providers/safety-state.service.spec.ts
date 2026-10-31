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
  };
  const auditService = {
    write: jest.fn().mockResolvedValue({}),
  };

  let service: SafetyStateService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    driver.isConnected.mockReturnValue(true);
    driver.readCoils.mockResolvedValue([false]);
    driver.writeRegister.mockResolvedValue(undefined);
    driver.writeCoil.mockResolvedValue(undefined);
    service = new SafetyStateService(
      plcService as never,
      auditService as never,
    );
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
});
