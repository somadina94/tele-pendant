import { ConflictException } from '@nestjs/common';
import { UserRole } from '../enums/user-role.enum';
import { UsersService } from './users.service';

describe('UsersService', () => {
  const auditService = { write: jest.fn().mockResolvedValue({}) };
  const usersRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
    create: jest.fn((x) => x),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates an operator and writes audit', async () => {
    usersRepository.findOne.mockResolvedValue(null);
    usersRepository.save.mockResolvedValue({
      id: 'u1',
      email: 'op@plant.local',
      displayName: 'Jordan',
      role: UserRole.OPERATOR,
      locale: 'en',
      localePinned: false,
      faceTemplate: null,
    });
    const service = new UsersService(
      usersRepository as never,
      auditService as never,
    );
    const row = await service.create(
      {
        email: 'op@plant.local',
        displayName: 'Jordan',
        password: 'long-enough',
        role: UserRole.OPERATOR,
      },
      { userEmail: 'admin@x', userDisplayName: 'Admin' },
    );
    expect(row.email).toBe('op@plant.local');
    expect(auditService.write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'users.create',
        userDisplayName: 'Admin',
      }),
    );
  });

  it('refuses duplicate email', async () => {
    usersRepository.findOne.mockResolvedValue({ id: 'x' });
    const service = new UsersService(
      usersRepository as never,
      auditService as never,
    );
    await expect(
      service.create(
        {
          email: 'op@plant.local',
          displayName: 'Jordan',
          password: 'long-enough',
          role: UserRole.SUPERVISOR,
        },
        {},
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('updates a non-admin user', async () => {
    usersRepository.findOne.mockResolvedValue({
      id: 'u2',
      email: 'op@plant.local',
      displayName: 'Jordan',
      role: UserRole.OPERATOR,
      suspended: false,
      passwordHash: 'old',
      tokenVersion: 0,
    });
    usersRepository.save.mockImplementation(async (x) => x);
    const service = new UsersService(
      usersRepository as never,
      auditService as never,
    );
    const row = await service.update(
      'u2',
      { displayName: 'Jay', suspended: true },
      { userId: 'admin-id', userEmail: 'admin@x', userDisplayName: 'Admin' },
    );
    expect(row.displayName).toBe('Jay');
    expect(row.suspended).toBe(true);
    expect(usersRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ tokenVersion: 1, suspended: true }),
    );
  });

  it('bumps tokenVersion when admin resets password (TP-40)', async () => {
    usersRepository.findOne.mockResolvedValue({
      id: 'u2',
      email: 'op@plant.local',
      displayName: 'Jordan',
      role: UserRole.OPERATOR,
      suspended: false,
      passwordHash: 'old',
      tokenVersion: 4,
    });
    usersRepository.save.mockImplementation(async (x) => x);
    const service = new UsersService(
      usersRepository as never,
      auditService as never,
    );
    await service.update(
      'u2',
      { password: 'brand-new-password' },
      { userId: 'admin-id', userEmail: 'admin@x', userDisplayName: 'Admin' },
    );
    expect(usersRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ tokenVersion: 5 }),
    );
  });

  it('removes a non-admin user', async () => {
    usersRepository.findOne.mockResolvedValue({
      id: 'u2',
      email: 'op@plant.local',
      role: UserRole.OPERATOR,
      displayName: 'Jordan',
    });
    const service = new UsersService(
      usersRepository as never,
      auditService as never,
    );
    await expect(
      service.remove('u2', {
        userId: 'admin-id',
        userEmail: 'admin@x',
        userDisplayName: 'Admin',
      }),
    ).resolves.toEqual({ ok: true });
    expect(usersRepository.remove).toHaveBeenCalled();
  });
});
