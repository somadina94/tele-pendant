import { auditLogsToCsv } from './audit-csv';

describe('auditLogsToCsv', () => {
  it('escapes commas and quotes', () => {
    const csv = auditLogsToCsv([
      {
        id: '1',
        action: 'test',
        result: 'success',
        createdAt: new Date('2026-01-02T03:04:00.000Z'),
        userDisplayName: 'Alice "Admin"',
        userEmail: 'a@example.com',
        resource: 'r1,r2',
        details: 'line\nbreak',
        ip: '127.0.0.1',
      },
    ]);
    expect(csv).toContain('Alice ""Admin""');
    expect(csv).toContain('"r1,r2"');
    expect(csv).toContain('"line\nbreak"');
  });
});
