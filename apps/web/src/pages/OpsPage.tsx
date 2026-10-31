import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { apiGet, apiPost } from '../lib/api';

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
  const alarms = useQuery({
    queryKey: ['alarms'],
    queryFn: () => apiGet<AlarmEvent[]>('/alarms'),
    refetchInterval: 2000,
  });
  const trends = useQuery({
    queryKey: ['trends-height'],
    queryFn: () => apiGet<TrendPoint[]>('/trends/hoistHeightMm?minutes=30'),
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
        <h1>Alarms · Trends · Diagnostics</h1>
        <Link to="/operator">Operator</Link>
      </header>

      <section>
        <h2>Diagnostics</h2>
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
        <h2>Alarms</h2>
        <ul className="list">
          {(alarms.data ?? []).length === 0 && <li>No active alarms</li>}
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
                    Ack
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Trend: hoist height (recent)</h2>
        <ul className="list">
          {(trends.data ?? []).slice(-12).map((p, i) => (
            <li key={`${p.createdAt}-${i}`}>
              {new Date(p.createdAt).toLocaleTimeString()} — {p.value} mm
            </li>
          ))}
          {(trends.data ?? []).length === 0 && <li>No samples yet</li>}
        </ul>
      </section>
    </main>
  );
}
