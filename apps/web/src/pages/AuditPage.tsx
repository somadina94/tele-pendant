import { useQuery } from '@tanstack/react-query';
import { ClipboardList } from 'lucide-react';
import { apiGet } from '../lib/api';
import { useT } from '../lib/i18n';
import { HelpTip } from '../lib/tour';
import { PageSpinner } from '@/components/page-spinner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface AuditRow {
  id: string;
  userEmail?: string | null;
  action: string;
  resource?: string | null;
  result: string;
  createdAt: string;
}

export function AuditPage() {
  const { t } = useT();
  const audit = useQuery({
    queryKey: ['audit'],
    queryFn: () => apiGet<AuditRow[]>('/audit'),
  });

  if (audit.isLoading) {
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
      <HelpTip id="tour.audit.list">
        <Card>
          <CardHeader>
            <CardTitle>{t('auditTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Resource</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(audit.data ?? []).map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.userEmail ?? '—'}</TableCell>
                    <TableCell>{row.action}</TableCell>
                    <TableCell>{row.resource ?? '—'}</TableCell>
                    <TableCell>{row.result}</TableCell>
                    <TableCell>
                      {new Date(row.createdAt).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </HelpTip>
    </div>
  );
}
