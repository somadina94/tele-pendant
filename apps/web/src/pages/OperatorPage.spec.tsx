import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { OperatorPage } from './OperatorPage';
import { renderWithProviders } from '../test/render';
import * as api from '../lib/api';
import { ThemeProvider } from '@/components/theme-provider';
import { TourProvider } from '../lib/tour';

const socket = {
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn(),
};

vi.mock('../lib/realtime', () => ({
  getRealtimeSocket: () => socket,
  resetRealtimeSocket: vi.fn(),
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

const defaultTags = {
  hoistHeightMm: 100,
  loadKg: 5,
  speedPct: 0,
  motorRunning: false,
  fault: false,
  commsOk: true,
  values: {},
  at: new Date().toISOString(),
};

describe('OperatorPage', () => {
  beforeEach(() => {
    socket.on.mockClear();
    socket.off.mockClear();
    socket.emit.mockClear();
    socket.on.mockImplementation(
      (event: string, handler: (p: unknown) => void) => {
        if (event === 'tags.update') {
          handler(defaultTags);
        }
      },
    );
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
    const stop = await screen.findByRole('button', { name: 'STOP' });
    fireEvent.pointerDown(stop);
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));
    fireEvent.pointerDown(hoist);
    fireEvent.pointerMove(stop, { clientX: 150, clientY: 150 });
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
    expect(hoist).toHaveTextContent('IDLE');
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

  it('shows a layout error when the operator screen cannot load', async () => {
    vi.spyOn(api, 'apiGet').mockRejectedValue(new Error('offline'));
    renderWithProviders(<OperatorPage />);
    expect(await screen.findByText('offline')).toBeInTheDocument();
  });

  it('shows a generic layout error when the failure is not an Error', async () => {
    vi.spyOn(api, 'apiGet').mockRejectedValue('nope');
    renderWithProviders(<OperatorPage />);
    expect(
      await screen.findByText('Could not load operator screen'),
    ).toBeInTheDocument();
  });

  it('opens the operator screen after the live tag fallback timer', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    socket.on.mockImplementation(() => {});
    renderWithProviders(<OperatorPage />);
    expect(
      screen.getByRole('status', { name: 'Operator' }),
    ).toBeInTheDocument();
    await vi.advanceTimersByTimeAsync(2500);
    expect(await screen.findByText('Hoist Up')).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('clears the live fallback timer on unmount', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    socket.on.mockImplementation(() => {});
    const view = renderWithProviders(<OperatorPage />);
    expect(
      screen.getByRole('status', { name: 'Operator' }),
    ).toBeInTheDocument();
    view.unmount();
    await vi.advanceTimersByTimeAsync(2500);
    vi.useRealTimers();
  });

  it('renders when live tags arrive after the layout loads', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let tagsHandler: ((p: unknown) => void) | undefined;
    socket.on.mockImplementation(
      (event: string, handler: (p: unknown) => void) => {
        if (event === 'tags.update') tagsHandler = handler;
      },
    );
    renderWithProviders(<OperatorPage />);
    expect(
      screen.getByRole('status', { name: 'Operator' }),
    ).toBeInTheDocument();
    tagsHandler?.(defaultTags);
    expect(await screen.findByText('Hoist Up')).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('shows a warning status dot for non-normal safety modes', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue({
      ...layout,
      safety: {
        mode: 'maintenance',
        deadmanActive: false,
        eStopActive: false,
        watchdogOk: true,
      },
    });
    const { container } = renderWithProviders(<OperatorPage />);
    await screen.findByText('Hoist Up');
    expect(
      container.querySelector('.plant-cluster-status-dot.warn'),
    ).toBeTruthy();
  });

  it('renders empty cell slots when matrix has gaps', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue({
      ...layout,
      matrix: { rows: 1, cols: 2 },
      cells: [layout.cells[0]],
      background: null,
      overlays: undefined,
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
      expect(
        container.querySelectorAll('.matrix-grid-hole').length,
      ).toBeGreaterThan(0),
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
    fireEvent.pointerMove(hoist, { clientX: 150, clientY: 50 });
    await waitFor(() =>
      expect(api.apiPost).toHaveBeenCalledWith(
        '/hmi/cells/m1/activate',
        expect.objectContaining({ value: false }),
      ),
    );
    fireEvent.pointerDown(hoist);
    await waitFor(() =>
      expect(api.apiPost).toHaveBeenCalledWith(
        '/hmi/cells/m1/activate',
        expect.objectContaining({ value: true }),
      ),
    );
    fireEvent.pointerMove(hoist, { clientX: 150, clientY: 250 });
    await waitFor(() =>
      expect(api.apiPost).toHaveBeenCalledWith(
        '/hmi/cells/m1/activate',
        expect.objectContaining({ value: false }),
      ),
    );
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

  it('releases motion when pointer capture is lost', async () => {
    vi.spyOn(api, 'apiPost').mockResolvedValue({ ok: true });
    renderWithProviders(<OperatorPage />);
    const hoist = await screen.findByRole('button', { name: 'Hoist Up' });
    HTMLElement.prototype.setPointerCapture = vi.fn();
    fireEvent.pointerDown(hoist);
    await waitFor(() =>
      expect(api.apiPost).toHaveBeenCalledWith(
        '/hmi/cells/m1/activate',
        expect.objectContaining({ value: true }),
      ),
    );
    fireEvent.lostPointerCapture(hoist);
    await waitFor(() =>
      expect(api.apiPost).toHaveBeenCalledWith(
        '/hmi/cells/m1/activate',
        expect.objectContaining({ value: false }),
      ),
    );
  });

  it('skips coil drop when a held cell is no longer motion on hide', async () => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const get = vi.spyOn(api, 'apiGet').mockResolvedValue(layout);
    const post = vi.spyOn(api, 'apiPost').mockResolvedValue({ ok: true });
    render(
      <ThemeProvider
        attribute="class"
        defaultTheme="light"
        enableSystem={false}
      >
        <QueryClientProvider client={client}>
          <MemoryRouter>
            <TourProvider>
              <OperatorPage />
            </TourProvider>
          </MemoryRouter>
        </QueryClientProvider>
      </ThemeProvider>,
    );
    const hoist = await screen.findByRole('button', { name: 'Hoist Up' });
    fireEvent.pointerDown(hoist);
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        '/hmi/cells/m1/activate',
        expect.objectContaining({ value: true }),
      ),
    );
    get.mockResolvedValue({
      ...layout,
      cells: layout.cells.map((cell) =>
        cell.id === 'm1' ? { ...cell, isMotion: false } : cell,
      ),
    });
    await client.invalidateQueries({ queryKey: ['hmi-layout'] });
    await waitFor(() => {
      expect(
        client.getQueryCache().find({ queryKey: ['hmi-layout'] })?.state.data,
      ).toBeTruthy();
    });
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(
      post.mock.calls.filter(
        ([path, body]) =>
          path === '/hmi/cells/m1/activate' &&
          (body as { value?: boolean }).value === false,
      ),
    ).toHaveLength(0);
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
