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

  it('skips poller reconnect while a Use-this-PLC connect is still open (TP-41)', async () => {
    jest.spyOn(service.getDriver(), 'isConnected').mockReturnValue(false);
    type Health = {
      connected: boolean;
      connectionId: string | null;
      label: string | null;
      host: string | null;
      port: number | null;
      lastError: string | null;
    };
    let resolveConnect!: (value: Health) => void;
    const connectPromise = new Promise<Health>((resolve) => {
      resolveConnect = resolve;
    });
    const perform = jest
      .spyOn(
        service as unknown as {
          performConnect: (id: string, generation: number) => Promise<Health>;
        },
        'performConnect',
      )
      .mockReturnValue(connectPromise);

    const first = service.connect('a');
    const wait = service.reconnectIfNeeded();
    resolveConnect({
      connected: true,
      connectionId: 'a',
      label: 'a',
      host: '1',
      port: 502,
      lastError: null,
    });
    await first;
    await wait;
    expect(perform).toHaveBeenCalledTimes(1);
  });

  it('abandons a superseded connect when a newer swap starts (TP-41)', async () => {
    connections.findOneByOrFail.mockImplementation(
      async ({ id }: { id: string }) => ({
        id,
        label: id,
        host: '10.0.0.8',
        port: 502,
        unitId: 1,
        protocol: 'modbus-tcp',
      }),
    );
    jest.spyOn(service.getDriver(), 'disconnect').mockResolvedValue(undefined);
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const driverConnect = jest
      .spyOn(
        (
          service as unknown as {
            driver: { connect: (o: unknown) => Promise<void> };
          }
        ).driver,
        'connect',
      )
      .mockImplementation(async () => {
        if (driverConnect.mock.calls.length === 1) await firstGate;
      });

    const first = service.connect('old');
    const second = service.connect('new');
    releaseFirst();
    await first;
    await second;
    expect(driverConnect.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(
      (service as unknown as { active: { id: string } | null }).active?.id,
    ).toBe('new');
  });

  it('coalesces reconnect attempts when the socket is down', async () => {
    const isConnected = jest
      .spyOn(service.getDriver(), 'isConnected')
      .mockReturnValue(false);
    connections.findOne.mockResolvedValue({ id: 'sim' });
    const connect = jest
      .spyOn(service, 'connect')
      .mockImplementation(async () => {
        isConnected.mockReturnValue(true);
        return {
          connected: true,
          connectionId: 'sim',
          label: 'sim',
          host: '127.0.0.1',
          port: 1502,
          lastError: null,
        };
      });
    await Promise.all([
      service.reconnectIfNeeded(),
      service.reconnectIfNeeded(),
    ]);
    expect(connect).toHaveBeenCalledTimes(1);
    await service.reconnectIfNeeded();
    expect(connect).toHaveBeenCalledTimes(1);

    isConnected.mockReturnValue(false);
    connect.mockRejectedValueOnce(new Error('down'));
    await service.reconnectIfNeeded();
    expect(connect).toHaveBeenCalledTimes(2);
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
