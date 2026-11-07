import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { OperatorPage } from './OperatorPage';
import { renderWithProviders } from '../test/render';
import * as api from '../lib/api';
import type { ControlLease } from '../lib/api';
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

const heldControl = {
  held: true,
  holderUserId: 'u1',
  holderDisplayName: 'Op',
  youHold: true,
  expiresAt: new Date().toISOString(),
};

describe('OperatorPage', () => {
  beforeEach(() => {
    socket.on.mockClear();
    socket.off.mockClear();
    socket.emit.mockClear();
    localStorage.setItem('user', JSON.stringify({ id: 'u1', email: 'op@x' }));
    socket.on.mockImplementation(
      (event: string, handler: (p: unknown) => void) => {
        if (event === 'tags.update') {
          handler(defaultTags);
        }
      },
    );
    vi.spyOn(api, 'apiGet').mockImplementation(async (path: string) => {
      if (path === '/safety/control') return heldControl as never;
      return layout as never;
    });
    vi.spyOn(api, 'apiPost').mockImplementation(async (path: string) => {
      if (typeof path === 'string' && path.startsWith('/safety/control')) {
        return heldControl as never;
      }
      return { ok: true } as never;
    });
  });

  function mockPostWithControl(
    impl: (path: string, body?: unknown) => unknown | Promise<unknown>,
  ) {
    vi.spyOn(api, 'apiPost').mockImplementation(async (path, body) => {
      if (typeof path === 'string' && path.startsWith('/safety/control')) {
        const result = await impl(String(path), body);
        if (
          result &&
          typeof result === 'object' &&
          'held' in (result as object)
        ) {
          return result as never;
        }
        return heldControl as never;
      }
      return (await impl(String(path), body)) as never;
    });
  }

  function mockGetWithControl(layoutValue: unknown = layout) {
    vi.spyOn(api, 'apiGet').mockImplementation(async (path: string) => {
      if (path === '/safety/control') return heldControl as never;
      return layoutValue as never;
    });
  }

  it('renders matrix overlays and handles motion press/release', async () => {
    const { container } = renderWithProviders(<OperatorPage />);
    expect(await screen.findByText('Hoist Up')).toBeInTheDocument();
    expect(screen.getByText('Bay')).toBeInTheDocument();
    expect(container.querySelector('[data-feat="hmi-mimic"]')).toBeTruthy();
    expect(
      screen.getByRole('img', { name: 'Crane mimic' }),
    ).toBeInTheDocument();
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
    mockGetWithControl({
      ...layout,
      background: {
        ...layout.background,
        imageUrl: 'https://example.com/bay.png',
      },
    });
    mockPostWithControl(async (path) => {
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
    mockGetWithControl({
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
    mockGetWithControl({
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

  it('still starts hold when setPointerCapture throws (TP-31)', async () => {
    renderWithProviders(<OperatorPage />);
    const hoist = await screen.findByRole('button', { name: 'Hoist Up' });
    HTMLElement.prototype.setPointerCapture = vi.fn(() => {
      throw new DOMException('InvalidStateError');
    });
    HTMLElement.prototype.releasePointerCapture = vi.fn(() => {
      throw new DOMException('InvalidStateError');
    });
    HTMLElement.prototype.hasPointerCapture = vi.fn(() => true);
    fireEvent.pointerDown(hoist);
    await waitFor(() => expect(api.apiPost).toHaveBeenCalled());
    fireEvent.pointerUp(hoist);
  });

  it('releases a motion cell if the pointer is up before the press returns', async () => {
    let finishPress: (value: unknown) => void = () => undefined;
    mockPostWithControl(async (path, body) => {
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
    mockPostWithControl(async () => ({ ok: true }));
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
    mockPostWithControl(async () => ({ ok: true }));
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
    const get = vi.spyOn(api, 'apiGet').mockImplementation(async (path) => {
      if (path === '/safety/control') return heldControl as never;
      return layout as never;
    });
    const post = vi.spyOn(api, 'apiPost').mockImplementation(async (path) => {
      if (typeof path === 'string' && path.startsWith('/safety/control')) {
        return heldControl as never;
      }
      return { ok: true } as never;
    });
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
    get.mockImplementation(async (path) => {
      if (path === '/safety/control') return heldControl as never;
      return {
        ...layout,
        cells: layout.cells.map((cell) =>
          cell.id === 'm1' ? { ...cell, isMotion: false } : cell,
        ),
      } as never;
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
    mockPostWithControl(async (path, body) => {
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

  it('docks STOP outside the matrix with ≥44px targets (FEAT-A3)', async () => {
    const { container } = renderWithProviders(<OperatorPage />);
    const stop = await screen.findByRole('button', { name: 'STOP' });
    const dock = container.querySelector('[data-feat="a3-stop-dock"]');
    expect(dock).toBeTruthy();
    expect(dock?.contains(stop)).toBe(true);
    expect(stop).toHaveAttribute('data-stop-dock', 'true');
    expect(stop).toHaveAttribute('data-touch-min', '44');
    const hoist = screen.getByRole('button', { name: 'Hoist Up' });
    expect(hoist).toHaveAttribute('data-touch-min', '44');
    expect(dock?.contains(hoist)).toBe(false);
  });

  it('sends slow vs fast speed on motion activate (FEAT-A2)', async () => {
    renderWithProviders(<OperatorPage />);
    const hoist = await screen.findByRole('button', { name: 'Hoist Up' });
    expect(screen.getByRole('button', { name: 'Slow' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Slow' }));
    HTMLElement.prototype.setPointerCapture = vi.fn();
    fireEvent.pointerDown(hoist);
    await waitFor(() =>
      expect(api.apiPost).toHaveBeenCalledWith(
        '/hmi/cells/m1/activate',
        expect.objectContaining({ value: true, speed: 'slow' }),
      ),
    );
    fireEvent.pointerUp(hoist);
    fireEvent.click(screen.getByRole('button', { name: 'Fast' }));
    fireEvent.pointerDown(hoist);
    await waitFor(() =>
      expect(api.apiPost).toHaveBeenCalledWith(
        '/hmi/cells/m1/activate',
        expect.objectContaining({ value: true, speed: 'fast' }),
      ),
    );
    fireEvent.pointerUp(hoist);
  });

  it('omits speed on release when the cell disables variable speed (FEAT-A2)', async () => {
    mockGetWithControl({
      ...layout,
      cells: layout.cells.map((cell) =>
        cell.isMotion ? { ...cell, variableSpeed: false } : cell,
      ),
    });
    renderWithProviders(<OperatorPage />);
    expect(
      screen.queryByRole('button', { name: 'Slow' }),
    ).not.toBeInTheDocument();
    const hoist = await screen.findByRole('button', { name: 'Hoist Up' });
    HTMLElement.prototype.setPointerCapture = vi.fn();
    fireEvent.pointerDown(hoist);
    await waitFor(() =>
      expect(api.apiPost).toHaveBeenCalledWith(
        '/hmi/cells/m1/activate',
        expect.objectContaining({ value: true }),
      ),
    );
    (api.apiPost as unknown as ReturnType<typeof vi.fn>).mockClear();
    fireEvent.pointerUp(hoist);
    await waitFor(() =>
      expect(api.apiPost).toHaveBeenCalledWith(
        '/hmi/cells/m1/activate',
        expect.objectContaining({ value: false }),
      ),
    );
    const releaseCall = (
      api.apiPost as unknown as ReturnType<typeof vi.fn>
    ).mock.calls.find(
      (call) =>
        call[0] === '/hmi/cells/m1/activate' &&
        (call[1] as { value?: boolean }).value === false,
    );
    expect(releaseCall?.[1]).not.toHaveProperty('speed');
  });

  it('maps matrix cells through idle / running / blocked / fault (FEAT-A1)', async () => {
    renderWithProviders(<OperatorPage />);
    const hoist = await screen.findByRole('button', { name: 'Hoist Up' });
    const stop = screen.getByRole('button', { name: 'STOP' });
    expect(hoist).toHaveAttribute('data-cell-state', 'idle');
    expect(hoist).toHaveTextContent(/idle/i);
    expect(stop).toHaveAttribute('data-cell-state', 'idle');

    HTMLElement.prototype.setPointerCapture = vi.fn();
    fireEvent.pointerDown(hoist);
    await waitFor(() =>
      expect(hoist).toHaveAttribute('data-cell-state', 'running'),
    );
    expect(hoist).toHaveTextContent(/^[\s\S]*run[\s\S]*$/i);
    fireEvent.pointerUp(hoist);

    const safetyHandler = socket.on.mock.calls.find(
      (c) => c[0] === 'safety.state',
    )?.[1] as (p: unknown) => void;
    const tagsHandler = socket.on.mock.calls.find(
      (c) => c[0] === 'tags.update',
    )?.[1] as (p: unknown) => void;

    safetyHandler({
      mode: 'e_stop',
      deadmanActive: false,
      eStopActive: true,
      watchdogOk: true,
    });
    await waitFor(() =>
      expect(hoist).toHaveAttribute('data-cell-state', 'blocked'),
    );
    expect(hoist).toHaveTextContent(/blocked/i);
    expect(stop).toHaveAttribute('data-cell-state', 'running');

    tagsHandler({
      ...defaultTags,
      fault: true,
      at: new Date().toISOString(),
    });
    await waitFor(() =>
      expect(hoist).toHaveAttribute('data-cell-state', 'fault'),
    );
    expect(hoist).toHaveTextContent(/fault/i);
  });

  it('releases exclusive control from the banner (FEAT-A5)', async () => {
    const freeControl = {
      held: false,
      holderUserId: null,
      holderDisplayName: null,
      youHold: false,
      expiresAt: null,
    };
    mockPostWithControl(async (path) => {
      if (path === '/safety/control/release') return freeControl;
      if (path.startsWith('/safety/control')) return heldControl;
      return { ok: true };
    });
    renderWithProviders(<OperatorPage />);
    expect(
      await screen.findByRole('button', { name: 'Release control' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Release control' }));
    expect(
      await screen.findByRole('button', { name: 'Claim control' }),
    ).toBeInTheDocument();
  });

  it('blocks motion and steals with PIN when another operator holds control (FEAT-A5)', async () => {
    const otherControl = {
      held: true,
      holderUserId: 'u2',
      holderDisplayName: 'Bob',
      youHold: false,
      expiresAt: new Date().toISOString(),
    };
    vi.spyOn(api, 'apiGet').mockImplementation(async (path: string) => {
      if (path === '/safety/control') return otherControl as never;
      return layout as never;
    });
    vi.spyOn(api, 'apiPost').mockImplementation(async (path) => {
      if (path === '/safety/control/claim') {
        throw new Error('Control held by Bob');
      }
      if (path === '/safety/control/steal') return heldControl as never;
      if (typeof path === 'string' && path.startsWith('/safety/control')) {
        return otherControl as never;
      }
      return { ok: true } as never;
    });
    renderWithProviders(<OperatorPage />);
    expect(await screen.findByText(/Control held by/)).toBeInTheDocument();
    expect(screen.getByText(/Enter your reset PIN/i)).toBeInTheDocument();
    const hoist = screen.getByRole('button', { name: 'Hoist Up' });
    expect(hoist).toBeDisabled();
    fireEvent.pointerDown(hoist);
    expect(
      (await screen.findAllByText(/Control held by Bob/i)).length,
    ).toBeGreaterThan(0);
    const postCalls = (api.apiPost as unknown as ReturnType<typeof vi.fn>).mock
      .calls as Array<[string, unknown?]>;
    expect(postCalls.some(([path]) => path.includes('/hmi/cells/'))).toBe(
      false,
    );
    fireEvent.change(screen.getByLabelText(/Reset PIN/i), {
      target: { value: '1234' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Take control' }));
    expect(
      await screen.findByRole('button', { name: 'Release control' }),
    ).toBeInTheDocument();
  });

  it('claims free control and surfaces claim/release/steal errors (FEAT-A5)', async () => {
    const freeControl = {
      held: false,
      holderUserId: null,
      holderDisplayName: null,
      youHold: false,
      expiresAt: null,
    };
    vi.spyOn(api, 'apiGet').mockImplementation(async (path: string) => {
      if (path === '/safety/control') return freeControl as never;
      return layout as never;
    });
    vi.spyOn(api, 'apiPost').mockImplementation(async (path) => {
      if (path === '/safety/control/claim') {
        throw new Error('Claim exclusive control before moving');
      }
      if (typeof path === 'string' && path.startsWith('/safety/control')) {
        return freeControl as never;
      }
      return { ok: true } as never;
    });
    renderWithProviders(<OperatorPage />);
    const claimBtn = await screen.findByRole('button', {
      name: 'Claim control',
    });
    fireEvent.click(claimBtn);
    expect(
      await screen.findByText(/Claim exclusive control before moving/i),
    ).toBeInTheDocument();

    let releaseShouldFail = false;
    vi.spyOn(api, 'apiPost').mockImplementation(async (path) => {
      if (path === '/safety/control/claim') return heldControl as never;
      if (path === '/safety/control/release') {
        if (releaseShouldFail) throw new Error('Release failed');
        return freeControl as never;
      }
      if (typeof path === 'string' && path.startsWith('/safety/control')) {
        return heldControl as never;
      }
      return { ok: true } as never;
    });
    fireEvent.click(screen.getByRole('button', { name: 'Claim control' }));
    expect(
      await screen.findByRole('button', { name: 'Release control' }),
    ).toBeInTheDocument();
    releaseShouldFail = true;
    fireEvent.click(screen.getByRole('button', { name: 'Release control' }));
    expect(await screen.findByText('Release failed')).toBeInTheDocument();
  });

  it('shows steal PIN failure and merges control from safety.state (FEAT-A5)', async () => {
    const otherControl = {
      held: true,
      holderUserId: 'u2',
      holderDisplayName: 'Bob',
      youHold: false,
      expiresAt: new Date().toISOString(),
    };
    vi.spyOn(api, 'apiGet').mockImplementation(async (path: string) => {
      if (path === '/safety/control') return otherControl as never;
      return layout as never;
    });
    vi.spyOn(api, 'apiPost').mockImplementation(async (path) => {
      if (path === '/safety/control/claim') {
        throw new Error('Control held by Bob');
      }
      if (path === '/safety/control/steal') {
        throw new Error('PIN does not match');
      }
      if (typeof path === 'string' && path.startsWith('/safety/control')) {
        return otherControl as never;
      }
      return { ok: true } as never;
    });
    renderWithProviders(<OperatorPage />);
    await screen.findByRole('button', { name: 'Take control' });
    fireEvent.click(screen.getByRole('button', { name: 'Take control' }));
    expect(await screen.findByText('PIN does not match')).toBeInTheDocument();

    const safetyHandler = socket.on.mock.calls.find(
      (c) => c[0] === 'safety.state',
    )?.[1] as (p: unknown) => void;
    safetyHandler({
      mode: 'normal',
      deadmanActive: false,
      eStopActive: false,
      watchdogOk: true,
      control: heldControl,
    });
    expect(
      await screen.findByRole('button', { name: 'Release control' }),
    ).toBeInTheDocument();
  });

  it('heartbeats while holding control (FEAT-A5)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const heartbeat = vi.fn(async () => heldControl);
    vi.spyOn(api, 'apiPost').mockImplementation(async (path) => {
      if (path === '/safety/control/heartbeat') return heartbeat() as never;
      if (typeof path === 'string' && path.startsWith('/safety/control')) {
        return heldControl as never;
      }
      return { ok: true } as never;
    });
    const view = renderWithProviders(<OperatorPage />);
    await screen.findByRole('button', { name: 'Release control' });
    await vi.advanceTimersByTimeAsync(4000);
    expect(heartbeat).toHaveBeenCalled();
    view.unmount();
    vi.useRealTimers();
  });

  it('refreshes control status when not holding and blocks free motion (FEAT-A5)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const freeControl = {
      held: false,
      holderUserId: null,
      holderDisplayName: null,
      youHold: false,
      expiresAt: null,
    };
    const get = vi.spyOn(api, 'apiGet').mockImplementation(async (path) => {
      if (path === '/safety/control') return freeControl as never;
      return layout as never;
    });
    vi.spyOn(api, 'apiPost').mockImplementation(async (path) => {
      if (path === '/safety/control/claim') {
        throw new Error('busy');
      }
      if (typeof path === 'string' && path.startsWith('/safety/control')) {
        return freeControl as never;
      }
      return { ok: true } as never;
    });
    renderWithProviders(<OperatorPage />);
    const hoist = await screen.findByRole('button', { name: 'Hoist Up' });
    expect(hoist).toBeDisabled();
    const controlGetsBefore = get.mock.calls.filter(
      ([path]) => path === '/safety/control',
    ).length;
    await vi.advanceTimersByTimeAsync(4000);
    expect(
      get.mock.calls.filter(([path]) => path === '/safety/control').length,
    ).toBeGreaterThan(controlGetsBefore);
    fireEvent.pointerDown(hoist);
    expect(
      await screen.findByText(/Claim exclusive control before moving/i),
    ).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('tolerates a corrupt local user record when merging control (FEAT-A5)', async () => {
    localStorage.setItem('user', '{not-json');
    renderWithProviders(<OperatorPage />);
    expect(
      await screen.findByRole('button', { name: 'Release control' }),
    ).toBeInTheDocument();
  });

  it('reads empty and missing local user ids when merging control (FEAT-A5)', async () => {
    localStorage.removeItem('user');
    const { unmount } = renderWithProviders(<OperatorPage />);
    expect(await screen.findByText('Hoist Up')).toBeInTheDocument();
    unmount();
    localStorage.setItem('user', JSON.stringify({ id: '   ' }));
    renderWithProviders(<OperatorPage />);
    expect(await screen.findByText('Hoist Up')).toBeInTheDocument();
  });

  it('drops late control responses after unmount (FEAT-A5)', async () => {
    let finishClaim: (value: ControlLease) => void = () => undefined;
    vi.spyOn(api, 'apiPost').mockImplementation(async (path) => {
      if (path === '/safety/control/claim') {
        return new Promise((resolve) => {
          finishClaim = resolve;
        }) as never;
      }
      if (typeof path === 'string' && path.startsWith('/safety/control')) {
        return heldControl as never;
      }
      return { ok: true } as never;
    });
    const view = renderWithProviders(<OperatorPage />);
    await screen.findByRole('status', { name: 'Operator' });
    view.unmount();
    finishClaim(heldControl);
  });

  it('shows non-Error release/steal failures and holder id fallback (FEAT-A5)', async () => {
    const otherControl = {
      held: true,
      holderUserId: 'u2',
      holderDisplayName: null,
      youHold: false,
      expiresAt: new Date().toISOString(),
    };
    vi.spyOn(api, 'apiGet').mockImplementation(async (path: string) => {
      if (path === '/safety/control') return otherControl as never;
      return layout as never;
    });
    vi.spyOn(api, 'apiPost').mockImplementation(async (path) => {
      if (path === '/safety/control/claim') {
        throw new Error('Control held by u2');
      }
      if (path === '/safety/control/steal') {
        return Promise.reject('bad-pin');
      }
      if (typeof path === 'string' && path.startsWith('/safety/control')) {
        return otherControl as never;
      }
      return { ok: true } as never;
    });
    renderWithProviders(<OperatorPage />);
    expect(await screen.findByText(/Control held by/)).toBeInTheDocument();
    expect(screen.getByText(/u2/)).toBeInTheDocument();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Hoist Up' }));
    expect(
      (await screen.findAllByText(/Control held by u2/i)).length,
    ).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Take control' }));
    expect(await screen.findByText('PIN does not match')).toBeInTheDocument();

    mockPostWithControl(async (path) => {
      if (path === '/safety/control/release') {
        return Promise.reject('nope');
      }
      return heldControl;
    });
    const safetyHandler = socket.on.mock.calls.find(
      (c) => c[0] === 'safety.state',
    )?.[1] as (p: unknown) => void;
    safetyHandler({
      mode: 'normal',
      deadmanActive: false,
      eStopActive: false,
      watchdogOk: true,
      control: heldControl,
    });
    fireEvent.click(
      await screen.findByRole('button', { name: 'Release control' }),
    );
    expect(await screen.findByText('Release failed')).toBeInTheDocument();
  });

  it('ignores claim refresh errors when status fetch also fails (FEAT-A5)', async () => {
    const freeControl = {
      held: false,
      holderUserId: null,
      holderDisplayName: null,
      youHold: false,
      expiresAt: null,
    };
    vi.spyOn(api, 'apiGet').mockImplementation(async (path) => {
      if (path === '/safety/control') throw new Error('offline');
      return layout as never;
    });
    vi.spyOn(api, 'apiPost').mockImplementation(async (path) => {
      if (path === '/safety/control/claim') {
        throw new Error('nope');
      }
      if (typeof path === 'string' && path.startsWith('/safety/control')) {
        return freeControl as never;
      }
      return { ok: true } as never;
    });
    renderWithProviders(<OperatorPage />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Claim control' }),
    );
    expect(await screen.findByText('nope')).toBeInTheDocument();
  });

  it('surfaces a non-Error claim failure message (FEAT-A5)', async () => {
    const freeControl = {
      held: false,
      holderUserId: null,
      holderDisplayName: null,
      youHold: false,
      expiresAt: null,
    };
    vi.spyOn(api, 'apiGet').mockImplementation(async (path) => {
      if (path === '/safety/control') return freeControl as never;
      return layout as never;
    });
    vi.spyOn(api, 'apiPost').mockImplementation(async (path) => {
      if (path === '/safety/control/claim') {
        return Promise.reject('denied');
      }
      if (typeof path === 'string' && path.startsWith('/safety/control')) {
        return freeControl as never;
      }
      return { ok: true } as never;
    });
    renderWithProviders(<OperatorPage />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Claim control' }),
    );
    expect(
      await screen.findByText(/Claim exclusive control before moving/i),
    ).toBeInTheDocument();
  });

  it('switches plant screens and hides mimic when a custom graphic is set', async () => {
    mockGetWithControl({
      ...layout,
      background: {
        ...layout.background,
        id: 'bg1',
        name: 'demo-crane',
        imageUrl: '/hmi-assets/plant.svg',
      },
      backgrounds: [
        { id: 'bg1', name: 'demo-crane', active: true },
        { id: 'bg2', name: 'yard', active: false },
      ],
    });
    let failSwitch = false;
    const post = vi.spyOn(api, 'apiPost').mockImplementation(async (path) => {
      if (typeof path === 'string' && path.startsWith('/safety/control')) {
        return heldControl as never;
      }
      if (String(path).includes('/hmi/backgrounds/')) {
        if (failSwitch) throw new Error('switch failed');
        return { id: 'bg2', name: 'yard', active: true } as never;
      }
      return { ok: true } as never;
    });
    renderWithProviders(<OperatorPage />);
    expect(
      await screen.findByRole('img', { name: 'Plant background' }),
    ).toHaveAttribute('src', '/hmi-assets/plant.svg');
    expect(screen.getByRole('tablist', { name: 'Plant screens' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'demo-crane' }));
    fireEvent.click(screen.getByRole('button', { name: 'yard' }));
    await waitFor(() =>
      expect(
        post.mock.calls.some(
          (call) => call[0] === '/hmi/backgrounds/bg2/activate',
        ),
      ).toBe(true),
    );

    failSwitch = true;
    fireEvent.click(screen.getByRole('button', { name: 'yard' }));
    expect(await screen.findByText('switch failed')).toBeInTheDocument();

    post.mockImplementation(async (path) => {
      if (typeof path === 'string' && path.startsWith('/safety/control')) {
        return heldControl as never;
      }
      if (String(path).includes('/hmi/backgrounds/')) {
        throw 'switch denied';
      }
      return { ok: true } as never;
    });
    fireEvent.click(screen.getByRole('button', { name: 'yard' }));
    expect(
      await screen.findByText('Could not switch screen'),
    ).toBeInTheDocument();

    const safetyHandler = socket.on.mock.calls.find(
      (c) => c[0] === 'safety.state',
    )?.[1] as (p: unknown) => void;
    safetyHandler({ mode: 'normal', control: undefined });
  });
});
