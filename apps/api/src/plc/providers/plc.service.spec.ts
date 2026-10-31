import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PlcService } from './plc.service';

describe('PlcService configuration', () => {
  const connections = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn(),
    findOneBy: jest.fn(),
    findOneByOrFail: jest.fn(),
    create: jest.fn((value: Record<string, unknown>) => ({ ...value })),
    save: jest.fn(async (value: { id?: string }) => {
      if (!value.id) value.id = 'created';
      return value;
    }),
  };
  const registers = {
    find: jest.fn().mockResolvedValue([]),
  };
  const configService = { get: jest.fn() };
  let service: PlcService;

  beforeEach(() => {
    jest.clearAllMocks();
    registers.find.mockResolvedValue([]);
    service = new PlcService(
      connections as never,
      registers as never,
      configService as never,
    );
  });

  it('creates a connection and connects when it is the one in use', async () => {
    connections.findOne.mockResolvedValue(null);
    connections.findOneBy.mockResolvedValue({
      id: 'created',
      label: 'plant',
      host: '10.0.0.8',
    });
    const connect = jest.spyOn(service, 'connect').mockResolvedValue({
      connected: true,
      connectionId: 'created',
      label: 'plant',
      host: '10.0.0.8',
      port: 502,
      lastError: null,
    });
    const saved = await service.saveConnection({
      label: ' plant ',
      host: ' 10.0.0.8 ',
      port: 502,
      unitId: 1,
      enabled: true,
    });
    expect(saved.id).toBe('created');
    expect(connect).toHaveBeenCalledWith('created');
  });

  it('returns the saved row when the reload misses', async () => {
    connections.findOne.mockResolvedValue(null);
    connections.findOneBy.mockResolvedValue(null);
    jest.spyOn(service, 'connect').mockResolvedValue({
      connected: false,
      connectionId: null,
      label: null,
      host: null,
      port: null,
      lastError: null,
    });
    const saved = await service.saveConnection({
      label: 'plant',
      host: '10.0.0.8',
      port: 502,
      unitId: 1,
      enabled: false,
    });
    expect(saved.host).toBe('10.0.0.8');
  });

  it('updates an existing row and disconnects when it is no longer in use', async () => {
    const existing = {
      id: 'id-1',
      label: 'sim',
      host: '127.0.0.1',
      port: 1502,
      unitId: 1,
      enabled: true,
    };
    connections.findOneBy.mockResolvedValue(existing);
    connections.findOne.mockResolvedValue(existing);
    (service as unknown as { active: { id: string } | null }).active = {
      id: 'id-1',
    };
    const disconnect = jest
      .spyOn(service.getDriver(), 'disconnect')
      .mockResolvedValue(undefined);
    const saved = await service.saveConnection({
      id: 'id-1',
      label: 'sim',
      host: '10.0.0.9',
      port: 502,
      unitId: 2,
      enabled: false,
    });
    expect(saved.host).toBe('10.0.0.9');
    expect(disconnect).toHaveBeenCalled();
  });

  it('rejects a missing row, a duplicate label, and bad fields', async () => {
    connections.findOneBy.mockResolvedValue(null);
    await expect(
      service.saveConnection({
        id: 'missing',
        label: 'x',
        host: '10.0.0.1',
        port: 502,
        unitId: 1,
        enabled: false,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    connections.findOneBy.mockResolvedValue({ id: 'id-1', label: 'old' });
    connections.findOne.mockResolvedValue({ id: 'other', label: 'plant' });
    await expect(
      service.saveConnection({
        id: 'id-1',
        label: 'plant',
        host: '10.0.0.1',
        port: 502,
        unitId: 1,
        enabled: false,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    await expect(
      service.saveConnection({
        label: '   ',
        host: '10.0.0.1',
        port: 502,
        unitId: 1,
        enabled: false,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.saveConnection({
        label: 'plant',
        host: '   ',
        port: 502,
        unitId: 1,
        enabled: false,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.saveConnection({
        label: 'plant',
        host: '10.0.0.1',
        port: 0,
        unitId: 1,
        enabled: false,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.saveConnection({
        label: 'plant',
        host: '10.0.0.1',
        port: 502,
        unitId: 256,
        enabled: false,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('reports a connect failure after the row is saved', async () => {
    connections.findOne.mockResolvedValue(null);
    connections.findOneBy.mockResolvedValue(null);
    jest.spyOn(service, 'connect').mockRejectedValueOnce(new Error('timeout'));
    await expect(
      service.saveConnection({
        label: 'plant',
        host: '10.0.0.8',
        port: 502,
        unitId: 1,
        enabled: true,
      }),
    ).rejects.toThrow(/did not connect: timeout/);

    jest.spyOn(service, 'connect').mockRejectedValueOnce('down');
    await expect(
      service.saveConnection({
        label: 'plant',
        host: '10.0.0.8',
        port: 502,
        unitId: 1,
        enabled: true,
      }),
    ).rejects.toThrow(/did not connect: connect failed/);
  });

  it('reads register addresses from the database and refreshes after a save', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    registers.find.mockResolvedValue([{ name: 'coil.eStop', address: 40 }]);
    await expect(service.addressFor('coil.eStop', 11)).resolves.toBe(40);
    await expect(service.addressFor('missing', 11)).resolves.toBe(11);

    registers.find.mockResolvedValue([{ name: 'coil.eStop', address: 99 }]);
    await expect(service.addressFor('coil.eStop', 11)).resolves.toBe(40);

    jest.setSystemTime(new Date('2026-01-01T00:00:02Z'));
    await expect(service.addressFor('coil.eStop', 11)).resolves.toBe(99);

    registers.find.mockResolvedValue([{ name: 'coil.eStop', address: 7 }]);
    service.forgetAddresses();
    await expect(service.addressFor('coil.eStop', 11)).resolves.toBe(7);
    jest.useRealTimers();
  });
});
