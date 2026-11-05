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
  matrix: { rows: 1, cols: 3 },
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
      feedbackRegister: {
        id: 'rf',
        name: 'holding.hoistHeightMm',
        address: 1,
        kind: 'holding',
      },
      statusRegister: {
        id: 'rs',
        name: 'discrete.motorRunning',
        address: 3,
        kind: 'discrete',
      },
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
      statusRegister: {
        id: 'rs2',
        name: 'coil.estop',
        address: 5,
        kind: 'coil',
      },
    },
    {
      id: 't1',
      row: 0,
      col: 2,
      label: 'Trolley L',
      style: 'default',
      isMotion: true,
      requiresSafeAction: false,
      primaryRegister: null,
      feedbackRegister: {
        id: 'rf2',
        name: 'holding.loadKg',
        address: 2,
        kind: 'holding',
      },
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
    const { container } = renderWithProviders(<OperatorPage />);
    expect(await screen.findByText('Hoist Up')).toBeInTheDocument();
    expect(screen.getByText('Bay')).toBeInTheDocument();
    expect(
      (container.querySelector('.plant-graphic') as HTMLElement).style
        .background,
    ).toBe('red');

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
      values: { 'holding.hoistHeightMm': 100 },
    });
    safetyHandler({
      mode: 'normal',
      deadmanActive: true,
      eStopActive: true,
      watchdogOk: true,
    });
    expect(await screen.findByText(/E-STOP/)).toBeInTheDocument();
    expect(await screen.findByText(/F 100/)).toBeInTheDocument();
    tagsHandler({
      hoistHeightMm: 110,
      loadKg: 5,
      speedPct: 1,
      motorRunning: true,
      fault: false,
      commsOk: true,
      at: '',
      values: { 'holding.hoistHeightMm': 110 },
    });
    expect(await screen.findByText(/F 110/)).toBeInTheDocument();
    expect(screen.getByText(/S RUN/)).toBeInTheDocument();
    expect(screen.getByText(/F 5/)).toBeInTheDocument();
    expect(screen.getByText(/S —/)).toBeInTheDocument();

    const hoist = screen.getByRole('button', { name: 'Hoist Up' });
    HTMLElement.prototype.setPointerCapture = vi.fn();
    fireEvent.pointerDown(hoist);
    safetyHandler({
      mode: 'safe_state',
      deadmanActive: true,
      eStopActive: false,
      watchdogOk: true,
    });
    await waitFor(() => expect(api.apiPost).toHaveBeenCalled());
    // holding interval path + cleanup on release
    await new Promise((r) => setTimeout(r, 450));
    fireEvent.pointerUp(hoist);
    fireEvent.pointerLeave(hoist);
    fireEvent.pointerCancel(hoist);
    expect(socket.emit).toHaveBeenCalledWith('deadman.pulse');

    fireEvent.pointerDown(screen.getByRole('button', { name: 'STOP' }));
    fireEvent.pointerUp(screen.getByRole('button', { name: 'STOP' }));
    await waitFor(() =>
      expect(api.apiPost).toHaveBeenCalledWith(
        '/hmi/cells/s1/activate',
        expect.objectContaining({ safeActionPin: undefined }),
      ),
    );
    fireEvent.change(screen.getByPlaceholderText('Reset PIN'), {
      target: { value: '1234' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reset e-stop' }));
    await waitFor(() =>
      expect(api.apiPost).toHaveBeenCalledWith('/safety/reset', {
        pin: '1234',
      }),
    );
    vi.spyOn(api, 'apiPost').mockRejectedValueOnce(new Error('bad pin'));
    fireEvent.click(screen.getByRole('button', { name: 'Reset e-stop' }));
    expect(await screen.findByText('bad pin')).toBeInTheDocument();
    safetyHandler({
      mode: 'normal',
      deadmanActive: false,
      eStopActive: false,
      watchdogOk: true,
    });
    expect(screen.getByText('bad pin')).toBeInTheDocument();
    vi.spyOn(api, 'apiPost').mockRejectedValueOnce('nope');
    fireEvent.click(screen.getByRole('button', { name: 'Reset e-stop' }));
    expect(await screen.findByText('PIN does not match')).toBeInTheDocument();
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    fireEvent.pointerDown(hoist);
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('pagehide'));
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
        throw new Error('Motion blocked');
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
    expect(await screen.findByText('Motion blocked')).toBeInTheDocument();
    const safetyHandler = socket.on.mock.calls.find(
      (c) => c[0] === 'safety.state',
    )?.[1] as (p: unknown) => void;
    safetyHandler({
      mode: 'normal',
      deadmanActive: false,
      eStopActive: false,
      watchdogOk: true,
    });
    await waitFor(() =>
      expect(screen.queryByText('Motion blocked')).not.toBeInTheDocument(),
    );
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
      expect(container.querySelectorAll('.min-h-11').length).toBeGreaterThan(0),
    );
  });

  it('releases a motion cell if the pointer is up before the press returns', async () => {
    let finishPress: (value: unknown) => void = () => undefined;
    vi.spyOn(api, 'apiPost').mockImplementation(async (path, body) => {
      const value = (body as { value?: boolean } | undefined)?.value;
      if (String(path).includes('/activate') && value) {
        return new Promise((resolve) => {
          finishPress = resolve;
        });
      }
      if (String(path).includes('/activate')) {
        return { ok: false };
      }
      return { ok: true };
    });
    renderWithProviders(<OperatorPage />);
    const hoist = await screen.findByRole('button', { name: 'Hoist Up' });
    fireEvent.pointerDown(hoist);
    fireEvent.pointerUp(hoist);
    finishPress({ ok: true });
    await waitFor(() =>
      expect(api.apiPost).toHaveBeenCalledWith(
        '/hmi/cells/m1/activate',
        expect.objectContaining({ value: false }),
      ),
    );
  });

  it('stops motion when the pointer leaves the button while captured', async () => {
    vi.spyOn(api, 'apiPost').mockResolvedValue({ ok: true });
    renderWithProviders(<OperatorPage />);
    const hoist = await screen.findByRole('button', { name: 'Hoist Up' });
    HTMLElement.prototype.setPointerCapture = vi.fn();
    HTMLElement.prototype.releasePointerCapture = vi.fn();
    HTMLElement.prototype.hasPointerCapture = vi.fn().mockReturnValue(true);
    hoist.getBoundingClientRect = () =>
      ({
        left: 100,
        top: 100,
        right: 200,
        bottom: 200,
        width: 100,
        height: 100,
      }) as DOMRect;
    fireEvent.pointerDown(hoist);
    await waitFor(() =>
      expect(api.apiPost).toHaveBeenCalledWith(
        '/hmi/cells/m1/activate',
        expect.objectContaining({ value: true }),
      ),
    );
    fireEvent.pointerMove(hoist, { clientX: 250, clientY: 150 });
    await waitFor(() =>
      expect(api.apiPost).toHaveBeenCalledWith(
        '/hmi/cells/m1/activate',
        expect.objectContaining({ value: false }),
      ),
    );
  });

  it('keeps the screen calm when releasing a coil fails', async () => {
    vi.spyOn(api, 'apiPost').mockImplementation(async (path, body) => {
      const value = (body as { value?: boolean } | undefined)?.value;
      if (String(path).includes('/activate') && value === false) {
        throw new Error('release failed');
      }
      return { ok: true };
    });
    renderWithProviders(<OperatorPage />);
    const hoist = await screen.findByRole('button', { name: 'Hoist Up' });
    fireEvent.pointerDown(hoist);
    fireEvent.pointerUp(hoist);
    await waitFor(() =>
      expect(api.apiPost).toHaveBeenCalledWith(
        '/hmi/cells/m1/activate',
        expect.objectContaining({ value: false }),
      ),
    );
    expect(hoist).toHaveTextContent('Hoist Up');
  });
});
