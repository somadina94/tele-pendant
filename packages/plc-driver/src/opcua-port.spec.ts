import { OpcUaPort } from './opcua-port';

describe('OpcUaPort', () => {
  const session = {
    read: jest.fn(async (nodeId: string) => (nodeId.endsWith('Up') ? true : 12)),
    write: jest.fn(async () => undefined),
    close: jest.fn(async () => undefined),
  };

  it('reads and writes by node id and disconnects', async () => {
    const port = new OpcUaPort(async () => session);
    await expect(port.read({ kind: 'coil', address: 0 })).rejects.toThrow(
      /not connected/,
    );
    await port.connect({ host: '127.0.0.1', port: 4840 });
    port.setPoints([
      { kind: 'coil', address: 0, nodeId: 'ns=1;s=HoistUp' },
      { kind: 'discrete', address: 0, nodeId: 'ns=1;s=HoistUp' },
      { kind: 'holding', address: 1, nodeId: 'ns=1;s=LoadKg' },
      { kind: 'input', address: 1, nodeId: 'ns=1;s=LoadKg' },
    ]);
    await expect(port.read({ kind: 'coil', address: 0 })).resolves.toBe(true);
    await expect(
      port.read({ kind: 'holding', address: 1, nodeId: 'ns=1;s=LoadKg' }),
    ).resolves.toBe(12);
    await port.write({ kind: 'coil', address: 0 }, true);
    await port.write({ kind: 'holding', address: 1 }, 4);
    const driver = port.asModbus();
    expect(port.asModbus()).toBe(driver);
    await expect(driver.readCoils(0, 1)).resolves.toEqual([true]);
    await expect(driver.readHoldingRegisters(1, 1)).resolves.toEqual([12]);
    await expect(driver.readDiscreteInputs(0, 1)).resolves.toEqual([true]);
    await expect(driver.readInputRegisters(1, 1)).resolves.toEqual([12]);
    await driver.writeRegisters(1, [3]);
    await driver.connect({ host: 'x', port: 1, unitId: 1 });
    expect(port.isConnected()).toBe(true);
    await port.disconnect();
    expect(session.close).toHaveBeenCalled();
    await port.disconnect();
    await expect(port.read({ kind: 'coil', address: 0 })).rejects.toThrow(
      /not connected/,
    );
  });

  it('rejects a register that has no node id and ignores a bad number', async () => {
    const quiet = {
      read: jest.fn(async () => 'nope'),
      write: jest.fn(async () => undefined),
      close: jest.fn(async () => undefined),
    };
    const port = new OpcUaPort(async () => quiet);
    await port.connect({ host: '127.0.0.1', port: 4840 });
    await expect(port.read({ kind: 'holding', address: 9 })).rejects.toThrow(
      /No OPC UA node/,
    );
    port.setPoints([{ kind: 'holding', address: 9, nodeId: 'ns=1;s=X' }]);
    await expect(port.read({ kind: 'holding', address: 9 })).resolves.toBe(0);
    await port.write({ kind: 'discrete', address: 9, nodeId: 'ns=1;s=X' }, 1);
    expect(quiet.write).toHaveBeenCalledWith('ns=1;s=X', true);
  });
});
