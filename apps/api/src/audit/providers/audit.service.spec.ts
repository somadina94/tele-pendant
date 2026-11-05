import { AuditService } from './audit.service';
import { AuditLog } from '../entities/audit-log.entity';

function queryBuilderMock(rows: AuditLog[] = [], total = rows.length) {
  const qb = {
    orderBy: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getCount: jest.fn().mockResolvedValue(total),
    getMany: jest.fn().mockResolvedValue(rows),
  };
  return qb;
}

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
      createQueryBuilder: jest.fn(),
    };
    const usersRepo = { find: jest.fn().mockResolvedValue([]) };
    const service = new AuditService(repo as never, usersRepo as never);
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

  it('lists recent entries with default and capped limits via query', async () => {
    const qb = queryBuilderMock();
    const repo = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    };
    const usersRepo = { find: jest.fn().mockResolvedValue([]) };
    const service = new AuditService(repo as never, usersRepo as never);
    await service.list();
    expect(qb.take).toHaveBeenCalledWith(50);
    await service.list(500);
    expect(qb.take).toHaveBeenCalledWith(200);
  });

  it('applies filters on query', async () => {
    const qb = queryBuilderMock();
    const repo = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    };
    const usersRepo = { find: jest.fn().mockResolvedValue([]) };
    const service = new AuditService(repo as never, usersRepo as never);
    const from = new Date('2026-01-01T00:00:00.000Z');
    const to = new Date('2026-01-31T23:59:59.999Z');
    await service.query({
      page: 2,
      pageSize: 10,
      from,
      to,
      user: 'alice',
    });
    expect(qb.andWhere).toHaveBeenCalled();
    expect(qb.skip).toHaveBeenCalledWith(10);
    expect(qb.take).toHaveBeenCalledWith(10);
  });
});
