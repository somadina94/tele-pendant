import { describe, expect, it } from 'vitest';
import {
  auditExportQueryString,
  auditQueryString,
  formatAuditDateParam,
} from './audit-api';

describe('audit-api', () => {
  it('builds list and export query strings', () => {
    expect(auditQueryString({ page: 2, pageSize: 25, user: '  alice  ' })).toBe(
      'page=2&pageSize=25&user=alice',
    );
    expect(
      auditExportQueryString({
        from: '2026-01-01',
        to: '2026-01-31',
        user: 'bob',
      }),
    ).toBe('from=2026-01-01&to=2026-01-31&user=bob');
    expect(auditExportQueryString({})).toBe('');
  });

  it('formats audit date params in UTC', () => {
    expect(formatAuditDateParam(new Date('2026-06-15T23:59:59.000Z'))).toBe(
      '2026-06-15',
    );
  });
});
