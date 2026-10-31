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
        ];
      }
      if (path.startsWith('/trends/')) {
        return [{ value: 10, createdAt: new Date().toISOString() }];
      }
      return {
        plc: { connected: true, label: 'sim', lastError: 'timeout' },
        safety: { mode: 'normal', watchdogOk: true },
        uptimeSec: 9,
      };
    });
    const post = vi.spyOn(api, 'apiPost').mockResolvedValue({});
    renderWithProviders(<OpsPage />);
    await waitFor(() => expect(screen.getByText(/E-Stop/)).toBeInTheDocument());
    expect(screen.getByText(/Last error: timeout/)).toBeInTheDocument();
    expect(screen.getByText(/10 mm/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ack' }));
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(get).toHaveBeenCalled();
  });

  it('shows empty alarm and trend placeholders', async () => {
    vi.spyOn(api, 'apiGet').mockImplementation(async (path) => {
      if (path === '/alarms' || path.startsWith('/trends/')) return [];
      return {
        plc: { connected: false, label: null, lastError: null },
        safety: { mode: 'comms_lost', watchdogOk: false },
        uptimeSec: 1,
      };
    });
    renderWithProviders(<OpsPage />);
    expect(await screen.findByText('No active alarms')).toBeInTheDocument();
    expect(screen.getByText('No samples yet')).toBeInTheDocument();
  });
});
