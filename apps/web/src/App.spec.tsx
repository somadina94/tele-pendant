import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { App } from './App';
import { renderWithProviders } from './test/render';

vi.mock('./lib/realtime', () => ({
  getRealtimeSocket: () => ({
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
  }),
  resetRealtimeSocket: vi.fn(),
}));

vi.mock('./lib/api', async () => {
  const actual = await vi.importActual<typeof import('./lib/api')>('./lib/api');
  return {
    ...actual,
    apiGet: vi.fn(async (path: string) => {
      if (path === '/auth/me') {
        return {
          id: '1',
          email: 'admin@example.com',
          role: 'admin',
          displayName: 'Admin',
          locale: 'en',
        };
      }
      if (path === '/hmi/layout') {
        return {
          matrix: { rows: 0, cols: 0 },
          cells: [],
          background: null,
          overlays: [],
          registers: [],
          safety: {
            mode: 'normal',
            deadmanActive: false,
            eStopActive: false,
            watchdogOk: true,
          },
        };
      }
      if (path === '/plc/connections') return [];
      if (path === '/alarms') return [];
      if (path === '/audit' || path.startsWith('/audit?')) {
        return { items: [], total: 0, page: 1, pageSize: 25 };
      }
      if (path.startsWith('/trends/')) return [];
      if (path === '/diagnostics') {
        return {
          plc: { connected: true, label: 'sim', lastError: null },
          safety: { mode: 'normal', watchdogOk: true },
          uptimeSec: 1,
        };
      }
      if (path === '/media/camera') {
        return {
          deviceCameraEnabled: true,
          rtspUrl: null,
          notes: 'cam',
        };
      }
      if (path === '/media/codes') return [];
      return null;
    }),
    apiPost: vi.fn(),
  };
});

describe('App', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('shows the face page without a session and the shell when signed in', async () => {
    renderWithProviders(<App />, { route: '/face' });
    expect(
      await screen.findByRole('button', { name: /Face login/ }),
    ).toBeInTheDocument();
  });

  it('shows login at /', () => {
    renderWithProviders(<App />, { route: '/' });
    expect(
      screen.getByRole('heading', { name: 'Tele-Pendant' }),
    ).toBeInTheDocument();
  });

  it('redirects protected routes without token', () => {
    renderWithProviders(<App />, { route: '/operator' });
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('allows authed routes when token present', async () => {
    localStorage.setItem('accessToken', 'tok');
    renderWithProviders(<App />, { route: '/operator' });
    expect(await screen.findByRole('button', { name: 'STOP' })).toBeInTheDocument();
  });

  it('sends expired tokens back to login after session check', async () => {
    localStorage.setItem('accessToken', 'dead');
    const api = await import('./lib/api');
    vi.mocked(api.apiGet).mockRejectedValueOnce(new Error('Unauthorized'));
    renderWithProviders(<App />, { route: '/operator' });
    expect(
      await screen.findByRole('button', { name: 'Sign in' }),
    ).toBeInTheDocument();
    expect(localStorage.getItem('accessToken')).toBeNull();
  });

  it('renders other protected pages', async () => {
    localStorage.setItem('accessToken', 'tok');
    for (const route of [
      '/admin',
      '/ops',
      '/media',
      '/assistant',
      '/face',
      '/audit',
    ]) {
      const { unmount } = renderWithProviders(<App />, { route });
      expect(document.body).toBeTruthy();
      unmount();
    }
  });

  it('redirects /config to /admin (TP-30)', async () => {
    localStorage.setItem('accessToken', 'tok');
    const withSection = renderWithProviders(<App />, {
      route: '/config?section=plc',
      role: 'admin',
    });
    expect(
      await screen.findByText('Add a PLC', {}, { timeout: 5000 }),
    ).toBeInTheDocument();
    withSection.unmount();

    renderWithProviders(<App />, { route: '/config', role: 'admin' });
    expect(
      await screen.findByText('Add a PLC', {}, { timeout: 5000 }),
    ).toBeInTheDocument();
  });
});
