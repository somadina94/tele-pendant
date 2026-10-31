import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminPage } from './pages/AdminPage';
import { AuditPage } from './pages/AuditPage';
import { AssistantPage } from './pages/AssistantPage';
import { FacePage } from './pages/FacePage';
import { LoginPage } from './pages/LoginPage';
import { MediaPage } from './pages/MediaPage';
import { OperatorPage } from './pages/OperatorPage';
import { OpsPage } from './pages/OpsPage';

function RequireAuth({ children }: { children: ReactNode }) {
  const token = localStorage.getItem('accessToken');
  if (!token) return <Navigate to="/" replace />;
  return children;
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route path="/face" element={<FacePage />} />
      <Route
        path="/operator"
        element={
          <RequireAuth>
            <OperatorPage />
          </RequireAuth>
        }
      />
      <Route
        path="/admin"
        element={
          <RequireAuth>
            <AdminPage />
          </RequireAuth>
        }
      />
      <Route
        path="/ops"
        element={
          <RequireAuth>
            <OpsPage />
          </RequireAuth>
        }
      />
      <Route
        path="/media"
        element={
          <RequireAuth>
            <MediaPage />
          </RequireAuth>
        }
      />
      <Route
        path="/audit"
        element={
          <RequireAuth>
            <AuditPage />
          </RequireAuth>
        }
      />
      <Route
        path="/assistant"
        element={
          <RequireAuth>
            <AssistantPage />
          </RequireAuth>
        }
      />
    </Routes>
  );
}
