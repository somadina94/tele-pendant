import { AuditService } from './audit.service';
import { AuditLog } from '../entities/audit-log.entity';

describe('AuditService', () => {
  it('writes an audit entry with nullish defaults', async () => {
    const saved: AuditLog = {
      id: '1',
      action: 'auth.login',
      result: 'success',
      createdAt: new Date(),
    };
    const repo = {
      create: jest.fn((x) => x),
      save: jest.fn().mockResolvedValue(saved),
      find: jest.fn(),
    };
    const service = new AuditService(repo as never);
    const result = await service.write({ action: 'auth.login' });
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: null,
        userEmail: null,
        resource: null,
        details: null,
        ip: null,
        result: 'success',
      }),
    );
    expect(repo.save).toHaveBeenCalled();
    expect(result.action).toBe('auth.login');

    await service.write({
      action: 'x',
      userId: 'u',
      userEmail: 'e',
      resource: 'r',
      details: 'd',
      ip: '1',
      result: 'failure',
    });
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u',
        result: 'failure',
      }),
    );
  });

  it('lists recent entries with default and capped limits', async () => {
    const repo = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
    };
    const service = new AuditService(repo as never);
    await service.list();
    expect(repo.find).toHaveBeenCalledWith({
      order: { createdAt: 'DESC' },
      take: 50,
    });
    await service.list(500);
    expect(repo.find).toHaveBeenCalledWith({
      order: { createdAt: 'DESC' },
      take: 200,
    });
  });
});
