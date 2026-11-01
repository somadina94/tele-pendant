import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { apiGet, apiPost } from '../lib/api';
import { useT } from '../lib/i18n';

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

  return (
    <main className="shell admin">
      <header className="op-header">
        <h1>{t('alarmsTitle')}</h1>
        <Link to="/operator">{t('operator')}</Link>
      </header>

      <section>
        <h2>{t('diagnostics')}</h2>
        <ul className="list">
          <li>
            PLC connected: {String(diagnostics.data?.plc.connected ?? '—')} (
            {diagnostics.data?.plc.label ?? 'n/a'})
          </li>
          <li>Safety mode: {diagnostics.data?.safety.mode ?? '—'}</li>
          <li>
            Watchdog OK: {String(diagnostics.data?.safety.watchdogOk ?? '—')}
          </li>
          <li>Uptime: {diagnostics.data?.uptimeSec ?? '—'} s</li>
          {diagnostics.data?.plc.lastError && (
            <li className="error">
              Last error: {diagnostics.data.plc.lastError}
            </li>
          )}
        </ul>
      </section>

      <section>
        <h2>{t('alarms')}</h2>
        <ul className="list">
          {(alarms.data ?? []).length === 0 && <li>{t('noAlarms')}</li>}
          {(alarms.data ?? []).map((a) => (
            <li key={a.id}>
              <strong>[{a.definition.severity}]</strong> {a.definition.name} —{' '}
              {a.state} (value {a.value})
              {a.state === 'active' && (
                <>
                  {' '}
                  <button
                    type="button"
                    className="ghost"
                    onClick={() =>
                      void apiPost(`/alarms/${a.id}/ack`).then(() =>
                        alarms.refetch(),
                      )
                    }
                  >
                    {t('ack')}
                  </button>{' '}
                  <button
                    type="button"
                    className="ghost"
                    onClick={() =>
                      void apiPost(`/alarms/${a.id}/shelve`).then(() =>
                        alarms.refetch(),
                      )
                    }
                  >
                    {t('shelve')}
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>{t('trends')}</h2>
        {(trendKeys.data ?? []).length === 0 ? <p>{t('noSamples')}</p> : null}
        {(trendKeys.data ?? []).map((key) => (
          <TrendChart key={key} seriesKey={key} />
        ))}
      </section>
    </main>
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
      <figcaption>
        {seriesKey}: {last}
        {unit}
      </figcaption>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="80" role="img">
        <polyline fill="none" stroke="#7dcea0" strokeWidth="2" points={coords} />
      </svg>
    </figure>
  );
}
