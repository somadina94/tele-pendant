import { AlarmEngineService } from './alarm-engine.service';

describe('AlarmEngineService', () => {
  const definitions = {
    count: jest.fn().mockResolvedValue(1),
    find: jest.fn().mockResolvedValue([
      {
        id: 'd1',
        name: 'E-Stop',
        compareOp: 'eq',
        threshold: 1,
        enabled: true,
        register: { kind: 'coil', address: 11 },
      },
    ]),
    save: jest.fn().mockImplementation(async (x) => x),
    create: jest.fn((x) => x),
  };
  const events = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn(),
    findOneByOrFail: jest.fn(),
    save: jest.fn().mockImplementation(async (x) => ({ id: 'e1', ...x })),
    create: jest.fn((x) => x),
  };
  const registers = {
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn().mockImplementation(async (x) => ({ id: 'r1', ...x })),
    create: jest.fn((x) => x),
  };
  const driver = {
    isConnected: jest.fn().mockReturnValue(true),
    readCoils: jest.fn().mockResolvedValue([true]),
    readDiscreteInputs: jest.fn().mockResolvedValue([false]),
    readHoldingRegisters: jest.fn().mockResolvedValue([42]),
    readInputRegisters: jest.fn().mockResolvedValue([7]),
  };
  const plcService = { getDriver: () => driver };
  const gateway = { broadcast: jest.fn() };

  let service: AlarmEngineService;

  beforeEach(() => {
    jest.clearAllMocks();
    definitions.count.mockResolvedValue(1);
    definitions.find.mockResolvedValue([
      {
        id: 'd1',
        name: 'E-Stop',
        compareOp: 'eq',
        threshold: 1,
        enabled: true,
        register: { kind: 'coil', address: 11 },
      },
    ]);
    driver.isConnected.mockReturnValue(true);
    driver.readCoils.mockResolvedValue([true]);
    driver.readDiscreteInputs.mockResolvedValue([false]);
    driver.readHoldingRegisters.mockResolvedValue([42]);
    driver.readInputRegisters.mockResolvedValue([7]);
    service = new AlarmEngineService(
      definitions as never,
      events as never,
      registers as never,
      plcService as never,
      gateway as never,
    );
  });

  it('seeds defaults creating e-stop map and optional motor def', async () => {
    definitions.count.mockResolvedValue(0);
    registers.findOne
      .mockResolvedValueOnce({ name: 'discrete.motorRunning', id: 'fault' })
      .mockResolvedValueOnce(null);
    await service.onModuleInit();
    expect(registers.save).toHaveBeenCalled();
    expect(definitions.save).toHaveBeenCalled();
  });

  it('seeds using existing e-stop register', async () => {
    definitions.count.mockResolvedValue(0);
    registers.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ name: 'coil.eStop', id: 'estop' });
    await service.onModuleInit();
    expect(registers.save).not.toHaveBeenCalled();
    expect(definitions.save).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'E-Stop asserted' }),
    );
  });

  it('skips seed when definitions already exist', async () => {
    definitions.count.mockResolvedValue(2);
    await service.onModuleInit();
    expect(definitions.save).not.toHaveBeenCalled();
  });

  it('lists active and acks/shelves events', async () => {
    events.findOneByOrFail.mockResolvedValue({
      id: 'e1',
      state: 'active',
    });
    await service.listActive();
    expect(events.find).toHaveBeenCalled();

    await service.ack('e1');
    expect(events.save).toHaveBeenCalledWith(
      expect.objectContaining({ state: 'acked' }),
    );

    events.findOneByOrFail.mockResolvedValue({ id: 'e1', state: 'active' });
    await service.shelve('e1');
    expect(events.save).toHaveBeenCalledWith(
      expect.objectContaining({ state: 'shelved' }),
    );
  });

  it('raises alarm when e-stop coil is high', async () => {
    await service.evaluate();
    expect(events.save).toHaveBeenCalled();
    expect(gateway.broadcast).toHaveBeenCalledWith(
      'alarm.event',
      expect.objectContaining({ state: 'active' }),
    );
    // still tripped with existing active id (neither raise nor clear)
    await service.evaluate();
  });

  it('clears alarm when condition recovers', async () => {
    driver.readCoils.mockResolvedValue([true]);
    await service.evaluate();
    driver.readCoils.mockResolvedValue([false]);
    events.findOne.mockResolvedValue({ id: 'e1', state: 'active' });
    await service.evaluate();
    expect(events.save).toHaveBeenCalledWith(
      expect.objectContaining({ state: 'cleared' }),
    );
  });

  it('does not clear shelved alarms on recover', async () => {
    driver.readCoils.mockResolvedValue([true]);
    await service.evaluate();
    const savesBefore = events.save.mock.calls.length;
    driver.readCoils.mockResolvedValue([false]);
    events.findOne.mockResolvedValue({ id: 'e1', state: 'shelved' });
    await service.evaluate();
    const cleared = events.save.mock.calls
      .slice(savesBefore)
      .some((c) => c[0]?.state === 'cleared');
    expect(cleared).toBe(false);
  });

  it('ignores missing event rows when recovering', async () => {
    driver.readCoils.mockResolvedValue([true]);
    await service.evaluate();
    driver.readCoils.mockResolvedValue([false]);
    events.findOne.mockResolvedValue(null);
    await service.evaluate();
    expect(gateway.broadcast).toHaveBeenCalled();
  });

  it('skips evaluate when disconnected', async () => {
    driver.isConnected.mockReturnValue(false);
    await service.evaluate();
    expect(definitions.find).not.toHaveBeenCalled();
  });

  it('reads discrete/holding/input including empty register arrays', async () => {
    driver.readHoldingRegisters.mockResolvedValue([]);
    driver.readInputRegisters.mockResolvedValue([]);
    driver.readDiscreteInputs.mockResolvedValue([true]);
    definitions.find.mockResolvedValue([
      {
        id: 'gt',
        name: 'High',
        compareOp: 'gt',
        threshold: -1,
        enabled: true,
        register: { kind: 'holding', address: 1 },
      },
      {
        id: 'lt',
        name: 'Low',
        compareOp: 'lt',
        threshold: 1,
        enabled: true,
        register: { kind: 'input', address: 2 },
      },
      {
        id: 'neq',
        name: 'Neq',
        compareOp: 'neq',
        threshold: 1,
        enabled: true,
        register: { kind: 'discrete', address: 3 },
      },
      {
        id: 'eqd',
        name: 'DefaultEq',
        compareOp: 'unknown' as 'eq',
        threshold: 0,
        enabled: true,
        register: { kind: 'holding', address: 4 },
      },
      {
        id: 'disc0',
        name: 'DiscLow',
        compareOp: 'eq',
        threshold: 0,
        enabled: true,
        register: { kind: 'discrete', address: 5 },
      },
    ]);
    await service.evaluate();
    driver.readDiscreteInputs.mockResolvedValue([false]);
    await service.evaluate();
    expect(driver.readHoldingRegisters).toHaveBeenCalled();
    expect(driver.readInputRegisters).toHaveBeenCalled();
    expect(driver.readDiscreteInputs).toHaveBeenCalled();
  });
});
