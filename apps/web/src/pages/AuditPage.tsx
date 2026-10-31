import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { apiGet } from '../lib/api';

interface AuditRow {
  id: string;
  userEmail?: string | null;
  action: string;
  resource?: string | null;
  result: string;
  createdAt: string;
}

export function AuditPage() {
  const audit = useQuery({
    queryKey: ['audit'],
    queryFn: () => apiGet<AuditRow[]>('/audit'),
  });

  return (
    <main className="shell admin">
      <header className="op-header">
        <h1>Audit</h1>
        <Link to="/operator">Operator</Link>
      </header>
      {audit.isError ? (
        <p className="error">
          {audit.error instanceof Error ? audit.error.message : 'Audit failed'}
        </p>
      ) : null}
      <ul className="list">
        {(audit.data ?? []).map((row) => (
          <li key={row.id}>
            {row.userEmail ?? '—'} {row.action} {row.resource ?? '—'}{' '}
            {row.result} {new Date(row.createdAt).toLocaleString()}
          </li>
        ))}
      </ul>
    </main>
  );
}
