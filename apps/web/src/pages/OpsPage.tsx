import { useQuery } from '@tanstack/react-query';
import { Activity, CheckCheck, Pause } from 'lucide-react';
import { apiGet, apiPost } from '../lib/api';
import { useT } from '../lib/i18n';
import { HelpTip } from '../lib/tour';
import { PageSpinner } from '@/components/page-spinner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toastErr, toastOk } from '@/lib/toast';

interface AlarmEvent {
  id: string;
  state: string;
  value: number;
  definition: { name: string; severity: string };
  createdAt: string;
}

interface TrendPoint {
  value: number;
  createdAt: string;
}

export function OpsPage() {
  const { t } = useT();
  const alarms = useQuery({
    queryKey: ['alarms'],
    queryFn: () => apiGet<AlarmEvent[]>('/alarms'),
    refetchInterval: 2000,
  });
  const trendKeys = useQuery({
    queryKey: ['trend-keys'],
    queryFn: async () => {
      const rows = await apiGet<unknown>('/trends');
      return Array.isArray(rows) ? (rows as string[]) : [];
    },
    refetchInterval: 3000,
  });
  const diagnostics = useQuery({
    queryKey: ['diagnostics'],
    queryFn: () =>
      apiGet<{
        plc: {
          connected: boolean;
          label: string | null;
          lastError: string | null;
        };
        safety: { mode: string; watchdogOk: boolean };
        uptimeSec: number;
      }>('/diagnostics'),
    refetchInterval: 2000,
  });

  if (diagnostics.isLoading && alarms.isLoading) {
    return <PageSpinner label={t('alarmsTitle')} />;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{t('alarmsTitle')}</h2>

      <HelpTip id="tour.ops.diagnostics">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="size-4" /> {t('diagnostics')}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <p>
              PLC connected: {String(diagnostics.data?.plc.connected ?? '—')} (
              {diagnostics.data?.plc.label ?? 'n/a'})
            </p>
            <p>Safety mode: {diagnostics.data?.safety.mode ?? '—'}</p>
            <p>
              Watchdog OK: {String(diagnostics.data?.safety.watchdogOk ?? '—')}
            </p>
            <p>Uptime: {diagnostics.data?.uptimeSec ?? '—'} s</p>
            {diagnostics.data?.plc.lastError ? (
              <p className="text-destructive">
                Last error: {diagnostics.data.plc.lastError}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </HelpTip>

      <HelpTip id="tour.ops.alarms">
        <Card>
          <CardHeader>
            <CardTitle>{t('alarms')}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Severity</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {!alarms.data?.length ? (
                  <TableRow>
                    <TableCell colSpan={5}>{t('noAlarms')}</TableCell>
                  </TableRow>
                ) : null}
                {(alarms.data ?? []).map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <Badge
                        variant={
                          a.definition.severity === 'critical'
                            ? 'destructive'
                            : 'secondary'
                        }
                      >
                        {a.definition.severity}
                      </Badge>
                    </TableCell>
                    <TableCell>{a.definition.name}</TableCell>
                    <TableCell>{a.state}</TableCell>
                    <TableCell>{a.value}</TableCell>
                    <TableCell>
                      {a.state === 'active' ? (
                        <HelpTip id="tour.ops.ack">
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                void apiPost(`/alarms/${a.id}/ack`)
                                  .then(() => {
                                    toastOk(t('ack'));
                                    return alarms.refetch();
                                  })
                                  .catch((err: Error) => toastErr(err.message))
                              }
                            >
                              <CheckCheck /> {t('ack')}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                void apiPost(`/alarms/${a.id}/shelve`)
                                  .then(() => {
                                    toastOk(t('shelve'));
                                    return alarms.refetch();
                                  })
                                  .catch((err: Error) => toastErr(err.message))
                              }
                            >
                              <Pause /> {t('shelve')}
                            </Button>
                          </div>
                        </HelpTip>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </HelpTip>

      <HelpTip id="tour.ops.trends">
        <Card>
          <CardHeader>
            <CardTitle>{t('trends')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!trendKeys.data?.length ? (
              <p className="text-sm text-muted-foreground">{t('noSamples')}</p>
            ) : null}
            {(trendKeys.data ?? []).map((key) => (
              <TrendChart key={key} seriesKey={key} />
            ))}
          </CardContent>
        </Card>
      </HelpTip>
    </div>
  );
}

function TrendChart({ seriesKey }: { seriesKey: string }) {
  const query = useQuery({
    queryKey: ['trend', seriesKey],
    queryFn: async () => {
      const rows = await apiGet<unknown>(
        `/trends/${encodeURIComponent(seriesKey)}?minutes=30`,
      );
      return Array.isArray(rows) ? (rows as TrendPoint[]) : [];
    },
    refetchInterval: 3000,
  });
  const points = query.data ?? [];
  if (points.length === 0) return <p>No samples yet</p>;
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1);
  const width = 280;
  const height = 80;
  const coords = values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * width;
      const y = height - ((value - min) / span) * height;
      return `${x},${y}`;
    })
    .join(' ');
  const last = values[values.length - 1];
  const unit = seriesKey.toLowerCase().includes('mm') ? ' mm' : '';
  return (
    <figure>
      <figcaption className="mb-1 text-sm">
        {seriesKey}: {last}
        {unit}
      </figcaption>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height="80"
        role="img"
      >
        <polyline
          fill="none"
          stroke="currentColor"
          className="text-emerald-500"
          strokeWidth="2"
          points={coords}
        />
      </svg>
    </figure>
  );
}
