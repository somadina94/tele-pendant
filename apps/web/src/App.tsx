import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminPage } from './pages/AdminPage';
import { AuditPage } from './pages/AuditPage';
import { AssistantPage } from './pages/AssistantPage';
import { FacePage } from './pages/FacePage';
import { LoginPage } from './pages/LoginPage';
import { MediaPage } from './pages/MediaPage';
import { OperatorPage } from './pages/OperatorPage';
import { OpsPage } from './pages/OpsPage';
import { AppShell } from './layouts/AppShell';
import { apiGet } from './lib/api';
import { clearSession } from './lib/session';
import { PageSpinner } from '@/components/page-spinner';

function RequireAuth({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'loading' | 'ok' | 'out'>('loading');

  useEffect(() => {
    let cancelled = false;
    const token = localStorage.getItem('accessToken');
    if (!token) {
      setState('out');
      return;
    }
    void apiGet('/auth/me')
      .then(() => {
        if (!cancelled) setState('ok');
      })
      .catch(() => {
        clearSession();
        if (!cancelled) setState('out');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === 'loading') {
    return <PageSpinner label="Checking session" className="min-h-svh" />;
  }
  if (state === 'out') return <Navigate to="/" replace />;
  return children;
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route path="/face" element={<FacePage />} />
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route path="/operator" element={<OperatorPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/ops" element={<OpsPage />} />
        <Route path="/media" element={<MediaPage />} />
        <Route path="/audit" element={<AuditPage />} />
        <Route path="/assistant" element={<AssistantPage />} />
      </Route>
    </Routes>
  );
}
