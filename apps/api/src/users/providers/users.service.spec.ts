import { ConflictException } from '@nestjs/common';
import { UserRole } from '../enums/user-role.enum';
import { UsersService } from './users.service';

describe('UsersService', () => {
  const auditService = { write: jest.fn().mockResolvedValue({}) };
  const usersRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
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
});
