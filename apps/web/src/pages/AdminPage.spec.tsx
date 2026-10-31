import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { AdminPage } from './AdminPage';
import { renderWithProviders } from '../test/render';
import * as api from '../lib/api';

describe('AdminPage', () => {
  it('renders connections registers and cells', async () => {
    vi.spyOn(api, 'apiGet').mockImplementation(async (path: string) => {
      if (path === '/plc/connections') {
        return [
          {
            id: '1',
            label: 'sim',
            host: '127.0.0.1',
            port: 1502,
            enabled: true,
            isSimulator: true,
          },
          {
            id: '2',
            label: 'plant',
            host: '10.0.0.1',
            port: 502,
            enabled: false,
            isSimulator: false,
          },
        ];
      }
      return {
        matrix: { rows: 1, cols: 1 },
        cells: [
          {
            id: 'c1',
            row: 0,
            col: 0,
            label: 'Up',
            style: 'default',
            isMotion: true,
            requiresSafeAction: false,
            primaryRegister: {
              id: 'r1',
              name: 'coil.up',
              address: 0,
              kind: 'coil',
            },
            feedbackRegister: {
              id: 'r2',
              name: 'coil.fb',
              address: 1,
              kind: 'coil',
            },
            statusRegister: {
              id: 'r3',
              name: 'coil.st',
              address: 2,
              kind: 'coil',
            },
          },
          {
            id: 'c2',
            row: 0,
            col: 1,
            label: 'Spare',
            style: 'default',
            isMotion: false,
            requiresSafeAction: false,
            primaryRegister: null,
            feedbackRegister: null,
            statusRegister: null,
          },
        ],

        background: null,
        overlays: [],
        registers: [{ id: 'r1', name: 'coil.up', address: 0, kind: 'coil' }],
        safety: {
          mode: 'normal',
          deadmanActive: false,
          eStopActive: false,
          watchdogOk: true,
        },
      };
    });
    renderWithProviders(<AdminPage />);
    await waitFor(() =>
      expect(screen.getAllByText(/sim/).length).toBeGreaterThan(0),
    );
    expect(screen.getByText(/simulator/)).toBeInTheDocument();
    expect(screen.getAllByText(/coil\.up/).length).toBeGreaterThan(0);
    expect(screen.getByText(/coil\.fb/)).toBeInTheDocument();
    expect(screen.getByText(/coil\.st/)).toBeInTheDocument();
    expect(screen.getByText(/0,0/)).toBeInTheDocument();
  });
});
