import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { CalendarRange, ClipboardList, Download, X } from 'lucide-react';
import { AuditDateField } from '@/components/audit-date-field';
import { formatAuditUser } from '@/lib/audit-user';
import {
  auditExportQueryString,
  auditQueryString,
  type AuditFilters,
  type AuditListResult,
} from '@/lib/audit-api';
import { apiDownload, apiGet } from '../lib/api';
import { useT } from '../lib/i18n';
import { HelpTip } from '../lib/tour';
import { toastErr } from '@/lib/toast';
import { PageSpinner } from '@/components/page-spinner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

function pageNumbers(
  page: number,
  totalPages: number,
): (number | 'ellipsis')[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages: (number | 'ellipsis')[] = [1];
  if (page > 3) pages.push('ellipsis');
  const start = Math.max(2, page - 1);
  const end = Math.min(totalPages - 1, page + 1);
  for (let p = start; p <= end; p += 1) pages.push(p);
  if (page < totalPages - 2) pages.push('ellipsis');
  pages.push(totalPages);
  return pages;
}

export function AuditPage() {
  const { t } = useT();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [from, setFrom] = useState<string | undefined>();
  const [to, setTo] = useState<string | undefined>();
  const [userFilter, setUserFilter] = useState('');
  const [exportBusy, setExportBusy] = useState(false);

  const filters: AuditFilters = useMemo(
    () => ({
      page,
      pageSize,
      from,
      to,
      user: userFilter,
    }),
    [page, pageSize, from, to, userFilter],
  );

  const audit = useQuery({
    queryKey: ['audit', filters],
    queryFn: () =>
      apiGet<AuditListResult>(`/audit?${auditQueryString(filters)}`),
    placeholderData: (prev) => prev,
  });

  const total = audit.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rows = audit.data?.items ?? [];

  function applyUserFilter(value: string) {
    setUserFilter(value);
    setPage(1);
  }

  function clearFilters() {
    setFrom(undefined);
    setTo(undefined);
    setUserFilter('');
    setPage(1);
  }

  const hasFilters = Boolean(from || to || userFilter.trim());

  async function exportCsv() {
    setExportBusy(true);
    try {
      const qs = auditExportQueryString({ from, to, user: userFilter });
      const stamp = new Date().toISOString().slice(0, 10);
      const suffix = qs ? `?${qs}` : '';
      await apiDownload(`/audit/export${suffix}`, `audit-${stamp}.csv`);
    } catch (err) {
      toastErr(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExportBusy(false);
    }
  }

  if (audit.isLoading && !audit.data) {
    return <PageSpinner label={t('auditTitle')} />;
  }

  return (
    <div className="space-y-4">
      <HelpTip id="tour.audit.title">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <ClipboardList className="size-5" />
          {t('auditTitle')}
        </h2>
      </HelpTip>
      {audit.isError ? (
        <Alert variant="destructive">
          <AlertDescription>
            {audit.error instanceof Error
              ? audit.error.message
              : t('auditFailed')}
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarRange className="size-4" />
            Filters
          </CardTitle>
          <div className="flex flex-wrap gap-2">
            {hasFilters ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearFilters}
              >
                <X />
                Clear
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              loading={exportBusy}
              onClick={() => void exportCsv()}
            >
              <Download />
              Export CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <AuditDateField
            id="audit-from"
            label="From date"
            value={from}
            onChange={(next) => {
              setFrom(next);
              setPage(1);
            }}
          />
          <AuditDateField
            id="audit-to"
            label="To date"
            value={to}
            onChange={(next) => {
              setTo(next);
              setPage(1);
            }}
          />
          <div className="grid gap-2 sm:col-span-2 lg:col-span-1">
            <Label htmlFor="audit-user">Filter by user</Label>
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Input
                    id="audit-user"
                    placeholder="Name or email"
                    value={userFilter}
                    onChange={(e) => applyUserFilter(e.target.value)}
                  />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs text-left">
                  Enter name or email to export individual logs, or leave empty
                  to export all.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div className="grid gap-2">
            <Label>Rows per page</Label>
            <Select
              value={String(pageSize)}
              onValueChange={(value) => {
                setPageSize(Number(value));
                setPage(1);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <HelpTip id="tour.audit.list">
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle>{t('auditTitle')}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {total === 0
                ? 'No entries'
                : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}`}
            </p>
          </CardHeader>
          <CardContent className="space-y-4 overflow-x-auto">
            <Table className="min-w-[34rem]">
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Resource</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground">
                      No audit entries match these filters.
                    </TableCell>
                  </TableRow>
                ) : null}
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{formatAuditUser(row)}</TableCell>
                    <TableCell>{row.action}</TableCell>
                    <TableCell>{row.resource ?? '—'}</TableCell>
                    <TableCell>{row.result}</TableCell>
                    <TableCell>
                      {format(new Date(row.createdAt), 'PPpp')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {totalPages > 1 ? (
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      disabled={page <= 1 || audit.isFetching}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    />
                  </PaginationItem>
                  {pageNumbers(page, totalPages).map((item, index) =>
                    item === 'ellipsis' ? (
                      <PaginationItem key={`e-${index}`}>
                        <PaginationEllipsis />
                      </PaginationItem>
                    ) : (
                      <PaginationItem key={item}>
                        <PaginationLink
                          isActive={item === page}
                          disabled={audit.isFetching}
                          onClick={() => setPage(item)}
                        >
                          {item}
                        </PaginationLink>
                      </PaginationItem>
                    ),
                  )}
                  <PaginationItem>
                    <PaginationNext
                      disabled={page >= totalPages || audit.isFetching}
                      onClick={() =>
                        setPage((p) => Math.min(totalPages, p + 1))
                      }
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            ) : null}
          </CardContent>
        </Card>
      </HelpTip>
    </div>
  );
}
