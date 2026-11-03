import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { OperatorPage } from './OperatorPage';
import { renderWithProviders } from '../test/render';
import * as api from '../lib/api';

const socket = {
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn(),
};

vi.mock('../lib/realtime', () => ({
  getRealtimeSocket: () => socket,
}));

const layout = {
  matrix: { rows: 1, cols: 2 },
  cells: [
    {
      id: 'm1',
      row: 0,
      col: 0,
      label: 'Hoist Up',
      style: 'default',
      isMotion: true,
      requiresSafeAction: false,
      primaryRegister: null,
      feedbackRegister: null,
      statusRegister: null,
    },
    {
      id: 's1',
      row: 0,
      col: 1,
      label: 'STOP',
      style: 'estop',
      isMotion: false,
      requiresSafeAction: true,
      primaryRegister: null,
      feedbackRegister: null,
      statusRegister: null,
    },
  ],
  background: {
    id: 'bg',
    name: 'Bay',
    cssBackground: 'red',
    imageUrl: null,
  },
  overlays: [
    {
      id: 'o1',
      label: 'H',
      xPct: 10,
      yPct: 20,
      format: '{value} mm',
      register: {
        id: 'r',
        name: 'holding.hoistHeightMm',
        address: 1,
        kind: 'holding',
      },
    },
    {
      id: 'o2',
      label: 'L',
      xPct: 30,
      yPct: 40,
      format: '{value}',
      register: {
        id: 'r2',
        name: 'holding.loadKg',
        address: 2,
        kind: 'holding',
      },
    },
    {
      id: 'o3',
      label: 'M',
      xPct: 50,
      yPct: 60,
      format: '{value}',
      register: {
        id: 'r3',
        name: 'discrete.motorRunning',
        address: 3,
        kind: 'discrete',
      },
    },
    {
      id: 'o4',
      label: 'S',
      xPct: 70,
      yPct: 80,
      format: '{value}',
      register: {
        id: 'r4',
        name: 'holding.speedPct',
        address: 4,
        kind: 'holding',
      },
    },
    {
      id: 'o5',
      label: 'X',
      xPct: 5,
      yPct: 5,
      format: '{value}',
      register: null,
    },
  ],
  registers: [],
  safety: {
    mode: 'normal',
    deadmanActive: false,
    eStopActive: false,
    watchdogOk: true,
  },
};

describe('OperatorPage', () => {
  beforeEach(() => {
    socket.on.mockClear();
    socket.off.mockClear();
    socket.emit.mockClear();
    vi.spyOn(api, 'apiGet').mockResolvedValue(layout);
    vi.spyOn(api, 'apiPost').mockResolvedValue({ ok: true });
  });

  it('renders matrix overlays and handles motion press/release', async () => {
    renderWithProviders(<OperatorPage />);
    expect(await screen.findByText('Hoist Up')).toBeInTheDocument();
    expect(screen.getByText('Bay')).toBeInTheDocument();

    const tagsHandler = socket.on.mock.calls.find(
      (c) => c[0] === 'tags.update',
    )?.[1] as (p: unknown) => void;
    const safetyHandler = socket.on.mock.calls.find(
      (c) => c[0] === 'safety.state',
    )?.[1] as (p: unknown) => void;
    tagsHandler({
      hoistHeightMm: 100,
      loadKg: 5,
      speedPct: 1,
      motorRunning: true,
      fault: false,
      commsOk: true,
      at: '',
    });
    safetyHandler({
      mode: 'normal',
      deadmanActive: true,
      eStopActive: true,
      watchdogOk: true,
    });
    expect(await screen.findByText(/E-STOP/)).toBeInTheDocument();

    const hoist = screen.getByRole('button', { name: 'Hoist Up' });
    fireEvent.pointerDown(hoist);
    await waitFor(() => expect(api.apiPost).toHaveBeenCalled());
    // holding interval path + cleanup on release
    await new Promise((r) => setTimeout(r, 450));
    fireEvent.pointerUp(hoist);
    fireEvent.pointerLeave(hoist);
    fireEvent.pointerCancel(hoist);
    expect(socket.emit).toHaveBeenCalledWith('deadman.pulse');

    fireEvent.pointerDown(screen.getByRole('button', { name: 'STOP' }));
    await waitFor(() =>
      expect(api.apiPost).toHaveBeenCalledWith(
        '/hmi/cells/s1/activate',
        expect.objectContaining({ safeActionPin: undefined }),
      ),
    );
    fireEvent.change(screen.getByPlaceholderText('SAFE_ACTION_PIN'), {
      target: { value: '1234' },
    });
    fireEvent.pointerDown(screen.getByRole('button', { name: 'STOP' }));
    await waitFor(() =>
      expect(api.apiPost).toHaveBeenCalledWith(
        '/hmi/cells/s1/activate',
        expect.objectContaining({ safeActionPin: '1234' }),
      ),
    );
  });

  it('handles activate failure and logout', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue({
      ...layout,
      background: {
        ...layout.background,
        imageUrl: 'https://example.com/bay.png',
      },
    });
    vi.spyOn(api, 'apiPost').mockImplementation(async (path) => {
      if (String(path).includes('/hmi/cells/')) {
        throw new Error('blocked');
      }
      return { ok: true };
    });
    renderWithProviders(<OperatorPage />);
    const hoist = await screen.findByRole('button', { name: 'Hoist Up' });
    expect(hoist).toHaveTextContent('Hoist Up');
    expect(hoist).not.toHaveTextContent('IDLE');
    const photo = screen.getByRole('img', { name: 'Plant background' });
    expect(photo).toHaveAttribute('src', 'https://example.com/bay.png');
    fireEvent.error(photo);
    expect(
      screen.queryByRole('img', { name: 'Plant background' }),
    ).not.toBeInTheDocument();
    fireEvent.pointerDown(hoist);
    expect(await screen.findByText('blocked')).toBeInTheDocument();
    await waitFor(() =>
      expect(socket.emit).toHaveBeenCalledWith('deadman.release'),
    );

    expect(localStorage.getItem('accessToken')).toBeNull();
  });

  it('renders matrix placeholders when layout request fails', async () => {
    vi.spyOn(api, 'apiGet').mockRejectedValue(new Error('offline'));
    renderWithProviders(<OperatorPage />);
    expect(await screen.findByText('Plant graphic')).toBeInTheDocument();
    expect(screen.getByText(/safety/i)).toBeInTheDocument();
  });

  it('renders empty cell slots when matrix has gaps', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue({
      ...layout,
      matrix: { rows: 1, cols: 2 },
      cells: [layout.cells[0]],
      background: null,
      overlays: [],
      safety: {
        mode: 'safe_state',
        deadmanActive: false,
        eStopActive: false,
        watchdogOk: false,
      },
    });
    const { container } = renderWithProviders(<OperatorPage />);
    expect(await screen.findByText('Plant graphic')).toBeInTheDocument();
    expect(await screen.findByText('Hoist Up')).toBeInTheDocument();
    await waitFor(() =>
      expect(container.querySelectorAll('.min-h-14').length).toBeGreaterThan(0),
    );
  });
});
