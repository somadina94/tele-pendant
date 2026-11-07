import { BadRequestException, NotFoundException } from '@nestjs/common';
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
    findOneBy: jest.fn(),
    remove: jest.fn().mockImplementation(async (x) => x),
  };
  const eventsDeleteQb = {
    delete: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const events = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn(),
    findOneByOrFail: jest.fn(),
    save: jest.fn().mockImplementation(async (x) => ({ id: 'e1', ...x })),
    create: jest.fn((x) => x),
    createQueryBuilder: jest.fn(() => eventsDeleteQb),
  };
  const registers = {
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn().mockImplementation(async (x) => ({ id: 'r1', ...x })),
    create: jest.fn((x) => x),
    findOneBy: jest.fn(),
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
  const auditService = { write: jest.fn().mockResolvedValue({}) };

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
      auditService as never,
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

  it('reloads shelved alarms on init so they clear after restart (TP-09)', async () => {
    // Mimic order: { createdAt: 'DESC' } — newest open row wins per definition.
    events.find.mockResolvedValueOnce([
      {
        id: 'e-shelved',
        state: 'shelved',
        definition: { id: 'd1' },
        createdAt: new Date('2026-06-01'),
      },
      {
        id: 'e-old',
        state: 'shelved',
        definition: { id: 'd1' },
        createdAt: new Date('2026-01-01'),
      },
      { id: 'e-orphan', state: 'active', definition: null },
    ]);
    await service.onModuleInit();

    driver.readCoils.mockResolvedValue([false]);
    events.findOne.mockResolvedValue({ id: 'e-shelved', state: 'shelved' });
    await service.evaluate();
    expect(events.findOne).toHaveBeenCalledWith({ where: { id: 'e-shelved' } });
    expect(events.save).toHaveBeenCalledWith(
      expect.objectContaining({ state: 'cleared' }),
    );
  });

  it('does not raise a duplicate after reloading an open alarm (TP-09)', async () => {
    events.find.mockResolvedValueOnce([
      {
        id: 'e-active',
        state: 'active',
        definition: { id: 'd1' },
        createdAt: new Date('2026-06-01'),
      },
    ]);
    await service.onModuleInit();
    events.save.mockClear();
    gateway.broadcast.mockClear();
    driver.readCoils.mockResolvedValue([true]);
    await service.evaluate();
    expect(events.save).not.toHaveBeenCalled();
    expect(gateway.broadcast).not.toHaveBeenCalled();
  });

  it('lists active and acks/shelves events', async () => {
    events.findOneByOrFail.mockResolvedValue({
      id: 'e1',
      state: 'active',
      definition: { id: 'd1', name: 'E-Stop asserted' },
    });
    await service.listActive();
    expect(events.find).toHaveBeenCalled();

    await service.ack('e1', { userEmail: 'ops@example.com' });
    expect(events.save).toHaveBeenCalledWith(
      expect.objectContaining({ state: 'acked' }),
    );
    expect(auditService.write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'alarm.ack',
        resource: 'E-Stop asserted',
        userEmail: 'ops@example.com',
        result: 'success',
      }),
    );

    events.findOneByOrFail.mockResolvedValue({
      id: 'e1',
      state: 'active',
      definition: { id: 'd1', name: 'E-Stop asserted' },
    });
    await service.shelve('e1', { userEmail: 'ops@example.com' });
    expect(events.save).toHaveBeenCalledWith(
      expect.objectContaining({ state: 'shelved' }),
    );
    expect(auditService.write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'alarm.shelve',
        resource: 'E-Stop asserted',
        result: 'success',
      }),
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

  it('unshelves a shelved alarm and rejects others', async () => {
    events.findOneByOrFail.mockResolvedValueOnce({
      id: 'e1',
      state: 'active',
      definition: { id: 'd1', name: 'E-Stop asserted' },
    });
    await expect(service.unshelve('e1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    events.findOneByOrFail.mockResolvedValueOnce({
      id: 'e1',
      state: 'shelved',
      definition: { id: 'd1', name: 'E-Stop asserted' },
    });
    await expect(
      service.unshelve('e1', { userEmail: 'a@b.c' }),
    ).resolves.toEqual(expect.objectContaining({ state: 'active' }));
    expect(auditService.write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'alarm.unshelve',
        resource: 'E-Stop asserted',
        userEmail: 'a@b.c',
        result: 'success',
      }),
    );
    events.findOneByOrFail.mockResolvedValueOnce({
      id: 'e2',
      state: 'shelved',
    });
    await service.unshelve('e2');
    expect(events.save).toHaveBeenCalled();
    expect(auditService.write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'alarm.unshelve',
        resource: 'e2',
      }),
    );
  });

  it('clears shelved alarms when the condition recovers', async () => {
    driver.readCoils.mockResolvedValue([true]);
    await service.evaluate();
    driver.readCoils.mockResolvedValue([false]);
    events.findOne.mockResolvedValue({ id: 'e1', state: 'shelved' });
    await service.evaluate();
    expect(events.save).toHaveBeenCalledWith(
      expect.objectContaining({ state: 'cleared' }),
    );
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

  it('creates, updates, and deletes alarm definitions', async () => {
    await expect(
      service.createDefinition({ name: '  ', registerId: 'r' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.createDefinition({
        name: 'High',
        registerId: 'r',
        compareOp: 'nope' as 'eq',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    registers.findOneBy.mockResolvedValue(null);
    await expect(
      service.createDefinition({ name: 'High', registerId: 'missing' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    registers.findOneBy.mockResolvedValue({ id: 'r', kind: 'holding' });
    await service.createDefinition({ name: 'Plain', registerId: 'r' });
    expect(auditService.write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'alarm.create',
        resource: 'Plain',
        details: expect.stringContaining('severity=warning'),
        result: 'success',
      }),
    );
    const created = await service.createDefinition({
      name: ' High ',
      registerId: 'r',
      severity: '  ',
      threshold: Number.NaN,
      enabled: false,
    });
    expect(created.severity).toBe('warning');
    expect(created.enabled).toBe(false);
    expect(created.threshold).toBe(1);
    const named = await service.createDefinition({
      name: 'Load',
      registerId: 'r',
      compareOp: 'gt',
      threshold: 50,
      severity: 'critical',
      enabled: true,
    });
    expect(named.compareOp).toBe('gt');
    expect(auditService.write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'alarm.create',
        resource: 'Load',
        details: expect.stringContaining('severity=critical'),
        result: 'success',
      }),
    );

    definitions.findOneBy.mockResolvedValue(null);
    await expect(
      service.updateDefinition('missing', {}),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.deleteDefinition('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    const row = {
      id: 'd2',
      name: 'Load',
      severity: 'warning',
      compareOp: 'eq' as const,
      threshold: 1,
      enabled: true,
      register: { id: 'r' },
    };
    definitions.findOneBy.mockResolvedValue(row);
    await service.updateDefinition('d2', {});
    expect(auditService.write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'alarm.update',
        resource: 'Load',
        details: expect.stringContaining('severity=warning'),
        result: 'success',
      }),
    );
    await expect(
      service.updateDefinition('d2', { name: '  ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.updateDefinition('d2', { compareOp: 'bad' as 'eq' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    registers.findOneBy.mockResolvedValue(null);
    await expect(
      service.updateDefinition('d2', { registerId: 'missing' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    registers.findOneBy.mockResolvedValue({ id: 'r2' });
    const updated = await service.updateDefinition('d2', {
      name: ' Load ',
      severity: '',
      compareOp: 'lt',
      threshold: Number.NaN,
      enabled: false,
      registerId: 'r2',
    });
    expect(updated.name).toBe('Load');
    expect(updated.severity).toBe('warning');
    expect(updated.enabled).toBe(false);
    await service.updateDefinition('d2', { threshold: 8, severity: 'info' });
    expect(row.threshold).toBe(8);
    await expect(service.listDefinitions()).resolves.toBeDefined();
    await expect(service.deleteDefinition('d2')).resolves.toEqual({ ok: true });
    expect(events.createQueryBuilder).toHaveBeenCalled();
    expect(eventsDeleteQb.where).toHaveBeenCalledWith('definition_id = :id', {
      id: 'd2',
    });
    expect(definitions.remove).toHaveBeenCalledWith(row);
  });

  it('rejects free-text severity and audits the denial (TP-21)', async () => {
    registers.findOneBy.mockResolvedValue({ id: 'r', kind: 'holding' });
    await expect(
      service.createDefinition({
        name: 'Overload',
        registerId: 'r',
        severity: 'urgent',
        actor: {
          userId: 'u1',
          userEmail: 'admin@example.com',
          ip: '127.0.0.1',
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(definitions.save).not.toHaveBeenCalled();
    expect(auditService.write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'alarm.create_denied',
        resource: 'Overload',
        details: 'invalid severity=urgent',
        result: 'failure',
        userEmail: 'admin@example.com',
      }),
    );

    const row = {
      id: 'd2',
      name: 'Load',
      severity: 'warning',
      compareOp: 'eq' as const,
      threshold: 1,
      enabled: true,
      register: { id: 'r' },
    };
    definitions.findOneBy.mockResolvedValue(row);
    await expect(
      service.updateDefinition('d2', {
        severity: 'major',
        actor: {
          userId: 'u1',
          userEmail: 'admin@example.com',
          ip: '127.0.0.1',
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(auditService.write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'alarm.update_denied',
        resource: 'Load',
        details: 'invalid severity=major',
        result: 'failure',
      }),
    );
  });
});
