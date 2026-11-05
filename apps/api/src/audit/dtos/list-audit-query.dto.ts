export interface ParsedAuditListQuery {
  page: number;
  pageSize: number;
  from?: Date;
  to?: Date;
  user?: string;
}

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 25;

function parseDateStart(raw?: string): Date | undefined {
  if (!raw?.trim()) return undefined;
  const d = new Date(`${raw.trim()}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function parseDateEnd(raw?: string): Date | undefined {
  if (!raw?.trim()) return undefined;
  const d = new Date(`${raw.trim()}T23:59:59.999Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export function parseAuditListQuery(query: {
  page?: string;
  pageSize?: string;
  limit?: string;
  from?: string;
  to?: string;
  user?: string;
}): ParsedAuditListQuery {
  let page = query.page ? Number(query.page) : 1;
  if (!Number.isFinite(page) || page < 1) page = 1;

  let pageSize = query.pageSize
    ? Number(query.pageSize)
    : query.limit
      ? Number(query.limit)
      : DEFAULT_PAGE_SIZE;
  if (!Number.isFinite(pageSize) || pageSize < 1) {
    pageSize = DEFAULT_PAGE_SIZE;
  }
  pageSize = Math.min(pageSize, MAX_PAGE_SIZE);

  const from = parseDateStart(query.from);
  const to = parseDateEnd(query.to);
  const user = query.user?.trim() || undefined;

  return { page, pageSize, from, to, user };
}
