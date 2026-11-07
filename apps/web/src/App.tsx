import { useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Navigate,
  Outlet,
  Route,
  Routes,
  useSearchParams,
} from 'react-router-dom';
import { AdminPage } from './pages/AdminPage';
import { AuditPage } from './pages/AuditPage';
import { AssistantPage } from './pages/AssistantPage';
import { FacePage } from './pages/FacePage';
import { LoginPage } from './pages/LoginPage';
import { MediaPage } from './pages/MediaPage';
import { OperatorPage } from './pages/OperatorPage';
import { OpsPage } from './pages/OpsPage';
import { RequireRole } from '@/components/require-role';
import { AppShell } from './layouts/AppShell';
import { apiGet, type HmiLayout, type PublicUser } from './lib/api';
import { clearSession } from './lib/session';
import { PageSpinner } from '@/components/page-spinner';

function RequireAuth({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<'loading' | 'ok' | 'out'>('loading');

  useEffect(() => {
    let cancelled = false;
    const token = localStorage.getItem('accessToken');
    if (!token) {
      setState('out');
      return;
    }
    void apiGet<PublicUser>('/auth/me')
      .then((user) => {
        localStorage.setItem('user', JSON.stringify(user));
        void queryClient.prefetchQuery({
          queryKey: ['hmi-layout'],
          queryFn: () => apiGet<HmiLayout>('/hmi/layout'),
        });
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

function FaceEntry() {
  const token = localStorage.getItem('accessToken');
  if (!token) return <Outlet />;
  return (
    <RequireAuth>
      <AppShell />
    </RequireAuth>
  );
}

/** TP-30: docs/bookmarks used /config; Config UI lives at /admin. */
function ConfigAliasRedirect() {
  const [params] = useSearchParams();
  const qs = params.toString();
  return <Navigate to={qs ? `/admin?${qs}` : '/admin'} replace />;
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route element={<FaceEntry />}>
        <Route path="/face" element={<FacePage />} />
      </Route>
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route path="/operator" element={<OperatorPage />} />
        <Route
          path="/admin"
          element={
            <RequireRole
              allow={['supervisor', 'admin']}
              detail="Config is for supervisors and administrators. Operators use the Operator, Media, and Ops screens."
            >
              <AdminPage />
            </RequireRole>
          }
        />
        <Route path="/config/*" element={<ConfigAliasRedirect />} />
        <Route path="/ops" element={<OpsPage />} />
        <Route path="/media" element={<MediaPage />} />
        <Route
          path="/audit"
          element={
            <RequireRole
              allow={['supervisor', 'admin']}
              detail="The audit log is limited to supervisors and administrators."
            >
              <AuditPage />
            </RequireRole>
          }
        />
        <Route path="/assistant" element={<AssistantPage />} />
      </Route>
    </Routes>
  );
}
