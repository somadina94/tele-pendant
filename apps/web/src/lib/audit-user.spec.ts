import { describe, expect, it } from 'vitest';
import { formatAuditUser } from './audit-user';

describe('formatAuditUser', () => {
  it('prefers display name over email', () => {
    expect(
      formatAuditUser({
        userDisplayName: 'Jordan',
        userEmail: 'j@x.com',
      }),
    ).toBe('Jordan');
  });

  it('falls back to email then dash', () => {
    expect(formatAuditUser({ userEmail: 'j@x.com' })).toBe('j@x.com');
    expect(formatAuditUser({})).toBe('—');
  });
});
