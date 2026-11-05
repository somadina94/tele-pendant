export interface AuditRow {
  id: string;
  userEmail?: string | null;
  userDisplayName?: string | null;
  action: string;
  resource?: string | null;
  result: string;
  createdAt: string;
}

export interface AuditListResult {
  items: AuditRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AuditFilters {
  page: number;
  pageSize: number;
  from?: string;
  to?: string;
  user?: string;
}

function appendDateUserParams(
  params: URLSearchParams,
  filters: Pick<AuditFilters, 'from' | 'to' | 'user'>,
) {
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.user?.trim()) params.set('user', filters.user.trim());
}

export function auditQueryString(filters: AuditFilters): string {
  const params = new URLSearchParams();
  params.set('page', String(filters.page));
  params.set('pageSize', String(filters.pageSize));
  appendDateUserParams(params, filters);
  return params.toString();
}

export function auditExportQueryString(
  filters: Pick<AuditFilters, 'from' | 'to' | 'user'>,
): string {
  const params = new URLSearchParams();
  appendDateUserParams(params, filters);
  return params.toString();
}

/** yyyy-MM-dd in UTC for API `from` / `to` query params. */
export function formatAuditDateParam(date: Date): string {
  return date.toISOString().slice(0, 10);
}
