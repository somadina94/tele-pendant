import { EventEmitter } from 'events';
import * as Modbus from 'jsmodbus';
import { TcpModbusDriver } from './tcp-driver';

type FakeSocket = EventEmitter & {
  connect: jest.Mock;
  end: jest.Mock;
  destroy: jest.Mock;
  off: (
    event: string | symbol,
    listener: (...args: unknown[]) => void,
  ) => FakeSocket;
};

jest.mock('net', () => {
  const { EventEmitter: EE } =
    jest.requireActual<typeof import('events')>('events');
  const created: FakeSocket[] = [];
  const makeSocket = (opts?: {
    onConnect?: (socket: FakeSocket) => void;
  }): FakeSocket => {
    const socket = new EE() as FakeSocket;
    socket.connect = jest.fn(() => {
      queueMicrotask(() => {
        if (opts?.onConnect) opts.onConnect(socket);
        else socket.emit('connect');
      });
      return socket;
    });
    socket.end = jest.fn((cb?: () => void) => {
      queueMicrotask(() => {
        socket.emit('close');
        cb?.();
      });
      return socket;
    });
    socket.destroy = jest.fn(() => {
      socket.emit('close');
      return socket;
    });
    socket.off = (
      event: string | symbol,
      listener: (...args: unknown[]) => void,
    ) => {
      socket.removeListener(event, listener);
      return socket;
    };
    created.push(socket);
    return socket;
  };
  return {
    Socket: Object.assign(
      jest.fn(() => makeSocket()),
      {
        __makeSocket: makeSocket,
        __sockets: created,
      },
    ),
  };
});

jest.mock('jsmodbus', () => ({
  client: {
    TCP: jest.fn().mockImplementation(() => ({
      readCoils: jest.fn(),
      readDiscreteInputs: jest.fn(),
      readHoldingRegisters: jest.fn(),
      readInputRegisters: jest.fn(),
      writeSingleCoil: jest.fn(),
      writeSingleRegister: jest.fn(),
      writeMultipleRegisters: jest.fn(),
    })),
  },
}));

type SocketMock = jest.Mock & {
  __makeSocket: (opts?: {
    onConnect?: (socket: FakeSocket) => void;
  }) => FakeSocket;
  __sockets: FakeSocket[];
};

function netSocketMock(): SocketMock {
  return (jest.requireMock('net') as { Socket: SocketMock }).Socket;
}

function lastClient() {
  const results = (Modbus.client.TCP as unknown as jest.Mock).mock.results;
  return results[results.length - 1]?.value as {
    readCoils: jest.Mock;
    readDiscreteInputs: jest.Mock;
    readHoldingRegisters: jest.Mock;
    readInputRegisters: jest.Mock;
    writeSingleCoil: jest.Mock;
    writeSingleRegister: jest.Mock;
    writeMultipleRegisters: jest.Mock;
  };
}

describe('TcpModbusDriver (TP-41)', () => {
  beforeEach(() => {
    const Socket = netSocketMock();
    Socket.__sockets.length = 0;
    Socket.mockClear();
    (Modbus.client.TCP as unknown as jest.Mock).mockClear();
    Socket.mockImplementation(() => Socket.__makeSocket());
  });

  function trackedSockets(): FakeSocket[] {
    return netSocketMock().__sockets;
  }

  it('ignores close/error from a superseded socket after reconnect', async () => {
    const driver = new TcpModbusDriver();
    await driver.connect({ host: '127.0.0.1', port: 1502, unitId: 1 });
    expect(driver.isConnected()).toBe(true);
    const first = trackedSockets()[0]!;

    await driver.connect({ host: '127.0.0.1', port: 1502, unitId: 1 });
    expect(driver.isConnected()).toBe(true);
    expect(trackedSockets().length).toBeGreaterThanOrEqual(2);

    first.emit('close');
    first.emit('error', new Error('old'));
    expect(driver.isConnected()).toBe(true);

    const second = trackedSockets()[trackedSockets().length - 1]!;
    second.emit('error', new Error('live'));
    expect(driver.isConnected()).toBe(false);
  });

  it('disconnect leaves the driver idle even if close fires twice', async () => {
    const driver = new TcpModbusDriver();
    await driver.connect({ host: '10.0.0.1', port: 502, unitId: 1 });
    const socket = trackedSockets()[0]!;
    await driver.disconnect();
    expect(driver.isConnected()).toBe(false);
    socket.emit('close');
    expect(driver.isConnected()).toBe(false);
    await driver.disconnect();
  });

  it('rejects connect errors and timeouts', async () => {
    const driver = new TcpModbusDriver();
    const Socket = netSocketMock();
    Socket.mockImplementationOnce(() =>
      Socket.__makeSocket({
        onConnect: (socket) => socket.emit('error', new Error('refused')),
      }),
    );
    await expect(
      driver.connect({ host: '127.0.0.1', port: 1, unitId: 1 }),
    ).rejects.toThrow('refused');
    expect(driver.isConnected()).toBe(false);

    Socket.mockImplementationOnce(() =>
      Socket.__makeSocket({
        onConnect: () => {
          /* never emit connect — force timeout */
        },
      }),
    );
    await expect(
      driver.connect({
        host: '127.0.0.1',
        port: 1,
        unitId: 1,
        timeoutMs: 5,
      }),
    ).rejects.toThrow(/timeout/);
  });

  it('rejects a connect that was superseded mid-flight', async () => {
    const driver = new TcpModbusDriver();
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const Socket = netSocketMock();
    Socket.mockImplementationOnce(() =>
      Socket.__makeSocket({
        onConnect: (socket) => {
          void firstGate.then(() => socket.emit('connect'));
        },
      }),
    );

    const first = driver.connect({ host: '127.0.0.1', port: 1502, unitId: 1 });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(trackedSockets().length).toBe(1);

    const second = driver.connect({ host: '127.0.0.1', port: 1502, unitId: 1 });
    releaseFirst();
    await expect(first).rejects.toThrow(/superseded/);
    await second;
    expect(driver.isConnected()).toBe(true);
  });

  it('reads and writes through the active client', async () => {
    const driver = new TcpModbusDriver();
    await expect(driver.readCoils(0, 1)).rejects.toThrow(/not connected/);
    await driver.connect({ host: '127.0.0.1', port: 1502, unitId: 1 });
    const client = lastClient();
    client.readCoils.mockResolvedValue({
      response: { body: { valuesAsArray: [1, 0] } },
    });
    client.readDiscreteInputs.mockResolvedValue({
      response: { body: { valuesAsArray: [0] } },
    });
    client.readHoldingRegisters.mockResolvedValue({
      response: { body: { valuesAsArray: [9, 8] } },
    });
    client.readInputRegisters.mockResolvedValue({
      response: { body: { valuesAsArray: [3] } },
    });
    client.writeSingleCoil.mockResolvedValue(undefined);
    client.writeSingleRegister.mockResolvedValue(undefined);
    client.writeMultipleRegisters.mockResolvedValue(undefined);

    await expect(driver.readCoils(0, 2)).resolves.toEqual([true, false]);
    await expect(driver.readDiscreteInputs(1, 1)).resolves.toEqual([false]);
    await expect(driver.readHoldingRegisters(2, 2)).resolves.toEqual([9, 8]);
    await expect(driver.readInputRegisters(3, 1)).resolves.toEqual([3]);
    await driver.writeCoil(4, true);
    await driver.writeRegister(5, 12);
    await driver.writeRegisters(6, [1, 2]);
  });
});
