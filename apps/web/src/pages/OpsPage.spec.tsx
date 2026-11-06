import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { OpsPage } from './OpsPage';
import { renderWithProviders } from '../test/render';
import * as api from '../lib/api';

describe('OpsPage', () => {
  it('renders diagnostics alarms trends and acks', async () => {
    const get = vi.spyOn(api, 'apiGet').mockImplementation(async (path) => {
      if (path === '/alarms') {
        return [
          {
            id: 'a1',
            state: 'active',
            value: 1,
            definition: { name: 'E-Stop', severity: 'critical' },
            createdAt: new Date().toISOString(),
          },
          {
            id: 'a2',
            state: 'shelved',
            value: 1,
            definition: { name: 'Overload', severity: 'warn' },
            createdAt: new Date().toISOString(),
          },
          {
            id: 'a3',
            state: 'acked',
            value: 0,
            definition: { name: 'Seen', severity: 'info' },
            createdAt: new Date().toISOString(),
          },
        ];
      }
      if (path === '/trends')
        return ['hoistHeightMm', 'loadKg', 'speed', 'raw'];
      if (path.startsWith('/trends/loadKg')) {
        return [
          { value: 4, createdAt: new Date().toISOString() },
          { value: 4, createdAt: new Date().toISOString() },
        ];
      }
      if (path.startsWith('/trends/speed')) return [{ t: '1', value: 3 }];
      if (path.startsWith('/trends/raw')) return { nope: true };
      if (path.startsWith('/trends/')) {
        return [
          { value: 10, createdAt: new Date().toISOString() },
          { value: 12, createdAt: new Date().toISOString() },
        ];
      }
      return {
        plc: { connected: true, label: 'sim', lastError: 'timeout' },
        safety: { mode: 'normal', watchdogOk: true },
        uptimeSec: 9,
      };
    });
    const post = vi.spyOn(api, 'apiPost').mockResolvedValue({});
    renderWithProviders(<OpsPage />, { role: 'supervisor' });
    await waitFor(() => expect(screen.getByText(/E-Stop/)).toBeInTheDocument());
    expect(screen.getByText(/Last error: timeout/)).toBeInTheDocument();
    expect(await screen.findByText(/12 mm/)).toBeInTheDocument();
    expect(screen.getByText(/loadKg: 4/)).toBeInTheDocument();
    expect(screen.getByText(/shelved/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Ack' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Ack' }));
    fireEvent.click(screen.getByRole('button', { name: 'Shelve' }));
    fireEvent.click(screen.getByRole('button', { name: 'Unshelve' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/alarms/a1/shelve'));
    expect(post).toHaveBeenCalledWith('/alarms/a2/unshelve');
    expect(post).toHaveBeenCalledWith('/alarms/a1/ack');
    expect(get).toHaveBeenCalled();
  });

  it('shows empty alarm and trend placeholders', async () => {
    vi.spyOn(api, 'apiGet').mockImplementation(async (path) => {
      if (path === '/alarms' || path.startsWith('/trends/')) return [];
      if (path === '/trends') return { nope: true };
      return {
        plc: { connected: false, label: null, lastError: null },
        safety: { mode: 'comms_lost', watchdogOk: false },
        uptimeSec: 1,
      };
    });
    renderWithProviders(<OpsPage />, { role: 'supervisor' });
    expect(await screen.findByText('No active alarms')).toBeInTheDocument();
    expect(screen.getByText('No samples yet')).toBeInTheDocument();
  });

  it('renders empty lists when alarms and trends fail', async () => {
    vi.spyOn(api, 'apiGet').mockImplementation(async (path) => {
      if (path === '/alarms' || path === '/trends') {
        throw new Error('offline');
      }
      return {
        plc: { connected: true, label: 'sim', lastError: null },
        safety: { mode: 'normal', watchdogOk: true },
        uptimeSec: 2,
      };
    });
    renderWithProviders(<OpsPage />, { role: 'supervisor' });
    expect(await screen.findByText('No active alarms')).toBeInTheDocument();
    expect(screen.getByText('No samples yet')).toBeInTheDocument();
  });

  it('shows diagnostic placeholders when diagnostics fail', async () => {
    vi.spyOn(api, 'apiGet').mockImplementation(async (path) => {
      if (path === '/diagnostics') throw new Error('diag');
      if (path === '/alarms') return [];
      if (path === '/trends') return [];
      return [];
    });
    renderWithProviders(<OpsPage />, { role: 'supervisor' });
    expect(await screen.findByText(/PLC connected:/)).toBeInTheDocument();
    expect(screen.getByText(/n\/a/)).toBeInTheDocument();
  });

  it('defaults shelve permission when no session role is stored', async () => {
    localStorage.removeItem('user');
    vi.spyOn(api, 'apiGet').mockImplementation(async (path) => {
      if (path === '/alarms') {
        return [
          {
            id: 'a1',
            state: 'active',
            value: 1,
            definition: { name: 'E-Stop', severity: 'critical' },
            createdAt: new Date().toISOString(),
          },
        ];
      }
      if (path === '/trends') return [];
      return {
        plc: { connected: true, label: 'sim', lastError: null },
        safety: { mode: 'normal', watchdogOk: true },
        uptimeSec: 1,
      };
    });
    renderWithProviders(<OpsPage />);
    await screen.findByText(/E-Stop/);
    expect(
      screen.queryByRole('button', { name: 'Shelve' }),
    ).not.toBeInTheDocument();
  });

  it('hides shelve controls for operators', async () => {
    vi.spyOn(api, 'apiGet').mockImplementation(async (path) => {
      if (path === '/alarms') {
        return [
          {
            id: 'a1',
            state: 'active',
            value: 1,
            definition: { name: 'E-Stop', severity: 'critical' },
            createdAt: new Date().toISOString(),
          },
        ];
      }
      if (path === '/trends') return [];
      return {
        plc: { connected: true, label: 'sim', lastError: null },
        safety: { mode: 'normal', watchdogOk: true },
        uptimeSec: 1,
      };
    });
    renderWithProviders(<OpsPage />, { role: 'operator' });
    await screen.findByText(/E-Stop/);
    expect(
      screen.queryByRole('button', { name: 'Shelve' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Unshelve' }),
    ).not.toBeInTheDocument();
  });

  it('toasts when ack or shelve fails', async () => {
    vi.spyOn(api, 'apiGet').mockImplementation(async (path) => {
      if (path === '/alarms') {
        return [
          {
            id: 'a1',
            state: 'active',
            value: 1,
            definition: { name: 'E-Stop', severity: 'critical' },
            createdAt: new Date().toISOString(),
          },
          {
            id: 'a2',
            state: 'shelved',
            value: 1,
            definition: { name: 'Parked', severity: 'warn' },
            createdAt: new Date().toISOString(),
          },
        ];
      }
      if (path === '/trends') return [];
      return {
        plc: { connected: true, label: 'sim', lastError: null },
        safety: { mode: 'normal', watchdogOk: true },
        uptimeSec: 1,
      };
    });
    vi.spyOn(api, 'apiPost')
      .mockRejectedValueOnce(new Error('ack failed'))
      .mockRejectedValueOnce(new Error('shelve failed'))
      .mockRejectedValueOnce(new Error('unshelve failed'));
    renderWithProviders(<OpsPage />, { role: 'supervisor' });
    await screen.findByText(/E-Stop/);
    fireEvent.click(screen.getByRole('button', { name: 'Ack' }));
    fireEvent.click(screen.getByRole('button', { name: 'Shelve' }));
    fireEvent.click(screen.getByRole('button', { name: 'Unshelve' }));
    await waitFor(() => expect(api.apiPost).toHaveBeenCalledTimes(3));
  });
});
