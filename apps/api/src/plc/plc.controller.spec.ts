import 'reflect-metadata';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { PlcController } from './plc.controller';

describe('PlcController', () => {
  const plcService = {
    writeCoil: jest.fn().mockResolvedValue(undefined),
    writeHolding: jest.fn().mockResolvedValue(undefined),
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
});
