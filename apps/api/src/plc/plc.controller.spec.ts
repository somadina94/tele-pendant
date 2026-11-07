import 'reflect-metadata';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { PlcController } from './plc.controller';

describe('PlcController', () => {
  const plcService = {
    writeCoil: jest.fn().mockResolvedValue(undefined),
    writeHolding: jest.fn().mockResolvedValue(undefined),
    saveConnection: jest.fn(),
    connect: jest.fn(),
  };
  const auditService = {
    write: jest.fn().mockResolvedValue({ id: 'a1' }),
  };
  const adminReq = {
    user: {
      sub: 'admin-1',
      email: 'admin@example.com',
      displayName: 'Administrator',
      role: UserRole.ADMIN,
    },
    ip: '127.0.0.1',
  };

  let controller: PlcController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new PlcController(plcService as never, auditService as never);
  });

  it('allows only admin on raw coil and holding writes (TP-36)', () => {
    const coil = Object.getOwnPropertyDescriptor(
      PlcController.prototype,
      'writeCoil',
    )?.value as object;
    const holding = Object.getOwnPropertyDescriptor(
      PlcController.prototype,
      'writeHolding',
    )?.value as object;
    expect(Reflect.getMetadata(ROLES_KEY, coil)).toEqual([UserRole.ADMIN]);
    expect(Reflect.getMetadata(ROLES_KEY, holding)).toEqual([UserRole.ADMIN]);
  });

  it('writes a coil and audits the maintenance action', async () => {
    await expect(
      controller.writeCoil({ address: 11, value: false }, adminReq as never),
    ).resolves.toEqual({ ok: true });
    expect(plcService.writeCoil).toHaveBeenCalledWith(11, false);
    expect(auditService.write).toHaveBeenCalledWith({
      userId: 'admin-1',
      userEmail: 'admin@example.com',
      userDisplayName: 'Administrator',
      ip: '127.0.0.1',
      action: 'plc.coil.write',
      resource: 'coil:11',
      details: 'value=false',
      result: 'success',
    });
  });

  it('writes a holding register and audits the maintenance action', async () => {
    await expect(
      controller.writeHolding({ address: 0, value: 42 }, adminReq as never),
    ).resolves.toEqual({ ok: true });
    expect(plcService.writeHolding).toHaveBeenCalledWith(0, 42);
    expect(auditService.write).toHaveBeenCalledWith({
      userId: 'admin-1',
      userEmail: 'admin@example.com',
      userDisplayName: 'Administrator',
      ip: '127.0.0.1',
      action: 'plc.holding.write',
      resource: 'holding:0',
      details: 'value=42',
      result: 'success',
    });
  });

  it('audits PLC connection create, update, and connect by label', async () => {
    const saved = {
      id: 'c1',
      label: 'Plant PLC',
      host: '192.168.1.10',
      port: 502,
      unitId: 1,
      enabled: true,
      protocol: 'modbus-tcp',
    };
    plcService.saveConnection.mockResolvedValue(saved);
    plcService.connect.mockResolvedValue({
      connected: true,
      connectionId: 'c1',
      label: 'Plant PLC',
      host: '192.168.1.10',
      port: 502,
      lastError: null,
    });

    await expect(
      controller.create(
        {
          label: 'Plant PLC',
          host: '192.168.1.10',
          port: 502,
          unitId: 1,
          enabled: true,
        },
        adminReq as never,
      ),
    ).resolves.toEqual(saved);
    expect(auditService.write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'plc.connection.create',
        resource: 'Plant PLC',
        details: expect.stringContaining('host=192.168.1.10'),
        result: 'success',
      }),
    );

    await expect(
      controller.update(
        'c1',
        {
          label: 'Plant PLC',
          host: '192.168.1.10',
          port: 502,
          unitId: 1,
          enabled: false,
        },
        adminReq as never,
      ),
    ).resolves.toEqual(saved);
    expect(auditService.write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'plc.connection.update',
        resource: 'Plant PLC',
      }),
    );

    await expect(controller.connect('c1', adminReq as never)).resolves.toEqual(
      expect.objectContaining({ connected: true }),
    );
    expect(auditService.write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'plc.connection.connect',
        resource: 'Plant PLC',
        result: 'success',
      }),
    );
  });
});
