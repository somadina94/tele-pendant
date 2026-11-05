import { AuditLog } from '../entities/audit-log.entity';

function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function auditLogsToCsv(rows: AuditLog[]): string {
  const header = [
    'Time (UTC)',
    'Name',
    'Email',
    'Action',
    'Resource',
    'Result',
    'Details',
    'IP',
  ];
  const lines = [header.join(',')];
  for (const row of rows) {
    lines.push(
      [
        row.createdAt.toISOString(),
        row.userDisplayName ?? '',
        row.userEmail ?? '',
        row.action,
        row.resource ?? '',
        row.result,
        row.details ?? '',
        row.ip ?? '',
      ]
        .map((cell) => csvCell(String(cell)))
        .join(','),
    );
  }
  return `${lines.join('\n')}\n`;
}
