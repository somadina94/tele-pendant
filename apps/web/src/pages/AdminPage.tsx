import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { apiGet, HmiLayout } from '../lib/api';

export function AdminPage() {
  const layoutQuery = useQuery({
    queryKey: ['hmi-layout'],
    queryFn: () => apiGet<HmiLayout>('/hmi/layout'),
  });
  const connections = useQuery({
    queryKey: ['plc-connections'],
    queryFn: () =>
      apiGet<
        Array<{
          id: string;
          label: string;
          host: string;
          port: number;
          enabled: boolean;
          isSimulator: boolean;
        }>
      >('/plc/connections'),
  });

  return (
    <main className="shell admin">
      <header className="op-header">
        <h1>HMI config</h1>
        <Link to="/operator">Operator</Link>
      </header>
      <p className="lede">
        DB-backed layout (SQLite). Edit maps in later admin CRUD; seed ships
        demo crane.
      </p>

      <section>
        <h2>PLC connections</h2>
        <ul className="list">
          {(connections.data ?? []).map((c) => (
            <li key={c.id}>
              <strong>{c.label}</strong> — {c.host}:{c.port}
              {c.isSimulator ? ' (simulator)' : ''}
              {c.enabled ? ' · active' : ''}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Register maps</h2>
        <ul className="list">
          {(layoutQuery.data?.registers ?? []).map((r) => (
            <li key={r.id}>
              {r.name} · {r.kind}@{r.address}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Cells (3 PLC addresses each)</h2>
        <ul className="list">
          {(layoutQuery.data?.cells ?? []).map((c) => (
            <li key={c.id}>
              [{c.row},{c.col}] {c.label} — primary{' '}
              {c.primaryRegister?.name ?? '—'} / feedback{' '}
              {c.feedbackRegister?.name ?? '—'} / status{' '}
              {c.statusRegister?.name ?? '—'}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
