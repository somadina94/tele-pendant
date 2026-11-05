export function formatAuditUser(row: {
  userDisplayName?: string | null;
  userEmail?: string | null;
}): string {
  const name = row.userDisplayName?.trim();
  if (name) return name;
  if (row.userEmail) return row.userEmail;
  return '—';
}
