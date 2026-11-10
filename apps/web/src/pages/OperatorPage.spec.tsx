import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { OperatorPage } from './OperatorPage';
import { renderOperator } from '../test/render';
import * as api from '../lib/api';
import type { ControlLease } from '../lib/api';
import { ThemeProvider } from '@/components/theme-provider';
import { TourProvider } from '../lib/tour';

const socket = {
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn(),
  connected: false,
  id: 'sock-test',
  io: {
    on: vi.fn(),
    off: vi.fn(),
    engine: { transport: { name: 'websocket' } },
  },
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
    socket.connected = false;
    socket.io.on.mockClear();
    socket.io.off.mockClear();
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
      if (path === '/realtime/tags') return defaultTags as never;
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

  function emitSafety(payload: unknown) {
    for (const [event, handler] of socket.on.mock.calls) {
      if (event === 'safety.state') {
        (handler as (p: unknown) => void)(payload);
      }
    }
  }

  function mockGetWithControl(layoutValue: unknown = layout) {
    vi.spyOn(api, 'apiGet').mockImplementation(async (path: string) => {
      if (path === '/safety/control') return heldControl as never;
      if (path === '/realtime/tags') return defaultTags as never;
      return layoutValue as never;
    });
  }

  it('skips HTTP tag polling while the websocket stream is healthy', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    socket.connected = true;
    socket.on.mockImplementation(
      (event: string, handler: (p: unknown) => void) => {
        if (event === 'tags.update') handler(defaultTags);
      },
    );
    const get = vi.spyOn(api, 'apiGet').mockImplementation(async (path) => {
      if (path === '/safety/control') return heldControl as never;
      if (path === '/realtime/tags') return defaultTags as never;
      return layout as never;
    });
    renderOperator(<OperatorPage />);
    expect(await screen.findByText('Hoist Up')).toBeInTheDocument();
    const before = get.mock.calls.filter(
      ([p]) => p === '/realtime/tags',
    ).length;
    await vi.advanceTimersByTimeAsync(2500);
    const after = get.mock.calls.filter(([p]) => p === '/realtime/tags').length;
    expect(after).toBe(before);
    vi.useRealTimers();
  });

  it('drops stale live tags from websocket updates', async () => {
    const handlers: Record<string, (payload: unknown) => void> = {};
    socket.on.mockImplementation(
      (event: string, handler: (p: unknown) => void) => {
        handlers[event] = handler;
        if (event === 'tags.update') {
          handler({
            ...defaultTags,
            seq: 5,
            at: '2026-01-02T00:00:00.000Z',
          });
        }
      },
    );
    renderOperator(<OperatorPage />);
    await screen.findByText('Hoist Up');
    handlers['tags.update']?.({
      hoistHeightMm: 50,
      values: {},
      at: '2026-01-01T00:00:00.000Z',
    });
    // Stale seq without `at` covers payload.at ?? null on the drop path.
    handlers['tags.update']?.({
      hoistHeightMm: 51,
      values: {},
      seq: 1,
    });
    expect(screen.getByText('Hoist Up')).toBeInTheDocument();
  });

  it('applies live tags while holding motion and logs disconnect timing', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const handlers: Record<string, (payload?: unknown) => void> = {};
    socket.on.mockImplementation(
      (event: string, handler: (p: unknown) => void) => {
        handlers[event] = handler;
        if (event === 'tags.update') {
          handler({
            ...defaultTags,
            seq: 1,
            at: new Date().toISOString(),
          });
        }
      },
    );
    renderOperator(<OperatorPage />);
    const hoist = await screen.findByRole('button', { name: 'Hoist Up' });
    fireEvent.pointerDown(hoist);
    handlers['tags.update']?.({
      ...defaultTags,
      seq: 2,
      hoistHeightMm: 250,
      at: new Date().toISOString(),
    });
    await vi.advanceTimersByTimeAsync(1100);
    // Omit at/hoist/trolley so tags.apply ?? null fallbacks are hit.
    handlers['tags.update']?.({
      values: {},
      seq: 3,
    });
    handlers['disconnect']?.('transport close');
    fireEvent.pointerUp(hoist);
    vi.useRealTimers();
  });

  it('ignores failed estop presses without disturbing hold state', async () => {
    mockPostWithControl(async (path) => {
      if (String(path).includes('/hmi/cells/s1/activate')) {
        throw new Error('estop failed');
      }
      return heldControl;
    });
    renderOperator(<OperatorPage />);
    fireEvent.pointerDown(await screen.findByRole('button', { name: 'STOP' }));
    await Promise.resolve();
  });

  it('keeps holding hoist when pointer stays inside the cell', async () => {
    const rect = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        return {
          top: 0,
          bottom: 40,
          left: 0,
          right: 40,
          width: 40,
          height: 40,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        } as DOMRect;
      });
    renderOperator(<OperatorPage />);
    const hoist = await screen.findByRole('button', { name: 'Hoist Up' });
    fireEvent.pointerDown(hoist, { pointerId: 2, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(hoist, { pointerId: 2, clientX: 12, clientY: 12 });
    rect.mockRestore();
  });

  it('presses cells without pointer capture support', async () => {
    const original = HTMLElement.prototype.setPointerCapture;
    // @ts-expect-error test stub
    delete HTMLElement.prototype.setPointerCapture;
    renderOperator(<OperatorPage />);
    const hoist = await screen.findByRole('button', { name: 'Hoist Up' });
    fireEvent.pointerDown(hoist, { pointerId: 1 });
    fireEvent.pointerUp(hoist, { pointerId: 1 });
    HTMLElement.prototype.setPointerCapture = original;
  });

  it('logs disconnect before any websocket tags arrive', async () => {
    const handlers: Record<string, (payload?: unknown) => void> = {};
    socket.on.mockImplementation(
      (event: string, handler: (p: unknown) => void) => {
        handlers[event] = handler;
      },
    );
    renderOperator(<OperatorPage />);
    await screen.findByText('Hoist Up');
    handlers['disconnect']?.('io server disconnect');
  });

  it('pulses deadman on an active hold interval', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    socket.on.mockImplementation(
      (event: string, handler: (p: unknown) => void) => {
        if (event === 'safety.state') {
          handler({
            mode: 'normal',
            deadmanActive: false,
            eStopActive: false,
            watchdogOk: true,
          });
        }
      },
    );
    renderOperator(<OperatorPage />);
    const hoist = await screen.findByRole('button', { name: 'Hoist Up' });
    fireEvent.pointerDown(hoist);
    await vi.advanceTimersByTimeAsync(450);
    fireEvent.pointerUp(hoist);
    vi.useRealTimers();
  });

  it('throttles tag debug logs when not holding a cell', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const handlers: Record<string, (payload?: unknown) => void> = {};
    socket.on.mockImplementation(
      (event: string, handler: (p: unknown) => void) => {
        handlers[event] = handler;
      },
    );
    renderOperator(<OperatorPage />);
    await screen.findByText('Hoist Up');
    handlers['tags.update']?.({
      hoistHeightMm: 1,
      values: {},
      seq: 20,
      at: '2026-01-10T00:00:00.000Z',
    });
    await vi.advanceTimersByTimeAsync(1100);
    handlers['tags.update']?.({
      hoistHeightMm: 2,
      values: {},
      seq: 21,
      at: '2026-01-10T00:00:01.000Z',
    });
    vi.useRealTimers();
  });

  it('handles socket connect, disconnect, and reconnect hooks', async () => {
    const handlers: Record<string, (payload?: unknown) => void> = {};
    socket.on.mockImplementation(
      (event: string, handler: (p: unknown) => void) => {
        handlers[event] = handler;
        if (event === 'tags.update') handler(defaultTags);
      },
    );
    socket.io.on.mockImplementation(
      (event: string, handler: (p: unknown) => void) => {
        if (event === 'reconnect') handlers.reconnect = handler;
      },
    );
    renderOperator(<OperatorPage />);
    await screen.findByText('Hoist Up');
    handlers.connect?.();
    handlers.disconnect?.('transport close');
    handlers.reconnect?.(2);
    expect(handlers.connect).toBeDefined();
  });

  it('ignores overlapping HTTP tag pulls', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    socket.connected = false;
    socket.on.mockImplementation(
      (event: string, handler: (p: unknown) => void) => {
        if (event === 'tags.update') handler(defaultTags);
      },
    );
    let release!: () => void;
    vi.spyOn(api, 'apiGet').mockImplementation((path) => {
      if (path === '/realtime/tags') {
        return new Promise((resolve) => {
          release = () => resolve(defaultTags as never);
        });
      }
      if (path === '/safety/control')
        return Promise.resolve(heldControl as never);
      return Promise.resolve(layout as never);
    });
    renderOperator(<OperatorPage />);
    await screen.findByText('Hoist Up');
    await vi.advanceTimersByTimeAsync(1000);
    release();
    await Promise.resolve();
    vi.useRealTimers();
  });

  it('clears a failed motion press when activate-true rejects', async () => {
    mockPostWithControl(async (path, body) => {
      const value = (body as { value?: boolean } | undefined)?.value;
      if (String(path).includes('/activate') && value === true) {
        throw 'blocked-string';
      }
      return heldControl;
    });
    renderOperator(<OperatorPage />);
    const hoist = await screen.findByRole('button', { name: 'Hoist Up' });
    fireEvent.pointerDown(hoist);
    await waitFor(() =>
      expect(socket.emit).toHaveBeenCalledWith('deadman.release'),
    );
    await waitFor(() =>
      expect(socket.emit).toHaveBeenCalledWith('deadman.release'),
    );
  });

  it('logs activate-false failures that are not Error instances', async () => {
    mockPostWithControl(async (path, body) => {
      const value = (body as { value?: boolean } | undefined)?.value;
      if (String(path).includes('/activate') && value === false) {
        throw 'drop-string';
      }
      return heldControl;
    });
    renderOperator(<OperatorPage />);
    const hoist = await screen.findByRole('button', { name: 'Hoist Up' });
    fireEvent.pointerDown(hoist);
    await waitFor(() =>
      expect(api.apiPost).toHaveBeenCalledWith(
        '/hmi/cells/m1/activate',
        expect.objectContaining({ value: true }),
      ),
    );
    fireEvent.pointerUp(hoist);
    await waitFor(() =>
      expect(api.apiPost).toHaveBeenCalledWith(
        '/hmi/cells/m1/activate',
        expect.objectContaining({ value: false }),
      ),
    );
  });

  it('finishes a drag when the pointer leaves the cell', async () => {
    const rect = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        return {
          top: 0,
          bottom: 40,
          left: 0,
          right: 40,
          width: 40,
          height: 40,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        } as DOMRect;
      });
    renderOperator(<OperatorPage />);
    const hoist = await screen.findByRole('button', { name: 'Hoist Up' });
    fireEvent.pointerDown(hoist, { pointerId: 7, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(hoist, { pointerId: 7, clientX: 500, clientY: 500 });
    fireEvent.lostPointerCapture(hoist);
    await waitFor(() =>
      expect(api.apiPost).toHaveBeenCalledWith(
        '/hmi/cells/m1/activate',
        expect.objectContaining({ value: false }),
      ),
    );
    rect.mockRestore();
  });

  it('ignores visibility changes while the page stays visible', async () => {
    renderOperator(<OperatorPage />);
    const hoist = await screen.findByRole('button', { name: 'Hoist Up' });
    fireEvent.pointerDown(hoist);
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(
      vi.mocked(api.apiPost).mock.calls.filter((call) => {
        const [path, body] = call;
        return (
          path === '/hmi/cells/m1/activate' &&
          (body as { value?: boolean } | undefined)?.value === false
        );
      }),
    ).toHaveLength(0);
  });

  it('tolerates pointer release failures and ignored coil drops', async () => {
    const release = vi
      .spyOn(HTMLElement.prototype, 'releasePointerCapture')
      .mockImplementation(() => {
        throw new Error('release failed');
      });
    const has = vi
      .spyOn(HTMLElement.prototype, 'hasPointerCapture')
      .mockImplementation(() => true);
    mockPostWithControl(async (path, body) => {
      const value = (body as { value?: boolean } | undefined)?.value;
      if (String(path).includes('/activate') && value === false) {
        throw new Error('drop failed');
      }
      return heldControl;
    });
    renderOperator(<OperatorPage />);
    const hoist = await screen.findByRole('button', { name: 'Hoist Up' });
    fireEvent.pointerDown(hoist);
    await waitFor(() =>
      expect(api.apiPost).toHaveBeenCalledWith(
        '/hmi/cells/m1/activate',
        expect.objectContaining({ value: true }),
      ),
    );
    window.dispatchEvent(new Event('pagehide'));
    fireEvent.pointerUp(hoist);
    release.mockRestore();
    has.mockRestore();
  });

  it('applies HTTP live-tag backup and ignores empty/error polls', async () => {
    const get = vi.spyOn(api, 'apiGet').mockImplementation(async (path) => {
      if (path === '/safety/control') return heldControl as never;
      if (path === '/realtime/tags') return defaultTags as never;
      return layout as never;
    });
    renderOperator(<OperatorPage />);
    expect(await screen.findByText('Hoist Up')).toBeInTheDocument();
    await waitFor(() => {
      expect(get).toHaveBeenCalledWith('/realtime/tags');
    });
    get.mockImplementation(async (path) => {
      if (path === '/realtime/tags') return { at: null } as never;
      if (path === '/safety/control') return heldControl as never;
      return layout as never;
    });
    await waitFor(() => {
      expect(get).toHaveBeenCalledWith('/realtime/tags');
    });
    get.mockImplementation(async (path) => {
      if (path === '/realtime/tags') throw new Error('proxy stall');
      if (path === '/safety/control') return heldControl as never;
      return layout as never;
    });
    await waitFor(() => {
      expect(get).toHaveBeenCalledWith('/realtime/tags');
    });
    expect(screen.getByText('Hoist Up')).toBeInTheDocument();
  });

  it('renders matrix overlays and handles motion press/release', async () => {
    const { container } = renderOperator(<OperatorPage />);
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
    renderOperator(<OperatorPage />);
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
    renderOperator(<OperatorPage />);
    expect(await screen.findByText('offline')).toBeInTheDocument();
  });

  it('shows a generic layout error when the failure is not an Error', async () => {
    vi.spyOn(api, 'apiGet').mockRejectedValue('nope');
    renderOperator(<OperatorPage />);
    expect(
      await screen.findByText('Could not load operator screen'),
    ).toBeInTheDocument();
  });

  it('opens the operator screen after the live tag fallback timer', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    socket.on.mockImplementation(() => {});
    // No WS and no HTTP tags yet — wait for the 2.5s liveFallback path.
    vi.spyOn(api, 'apiGet').mockImplementation(async (path: string) => {
      if (path === '/safety/control') return heldControl as never;
      if (path === '/realtime/tags') return { at: null } as never;
      return layout as never;
    });
    renderOperator(<OperatorPage />);
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
    vi.spyOn(api, 'apiGet').mockImplementation(async (path: string) => {
      if (path === '/safety/control') return heldControl as never;
      if (path === '/realtime/tags') return { at: null } as never;
      return layout as never;
    });
    const view = renderOperator(<OperatorPage />);
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
    vi.spyOn(api, 'apiGet').mockImplementation(async (path: string) => {
      if (path === '/safety/control') return heldControl as never;
      if (path === '/realtime/tags') return { at: null } as never;
      return layout as never;
    });
    renderOperator(<OperatorPage />);
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
    const { container } = renderOperator(<OperatorPage />);
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
    const { container } = renderOperator(<OperatorPage />);
    expect(await screen.findByText('Plant graphic')).toBeInTheDocument();
    expect(await screen.findByText('Hoist Up')).toBeInTheDocument();
    await waitFor(() =>
      expect(
        container.querySelectorAll('.matrix-grid-hole').length,
      ).toBeGreaterThan(0),
    );
  });

  it('still starts hold when setPointerCapture throws (TP-31)', async () => {
    renderOperator(<OperatorPage />);
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
    renderOperator(<OperatorPage />);
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
    renderOperator(<OperatorPage />);
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
    renderOperator(<OperatorPage />);
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
    const { ControlLeaseProvider, ControlLeaseHeaderControls } =
      await import('../lib/control-lease');
    render(
      <ThemeProvider
        attribute="class"
        defaultTheme="light"
        enableSystem={false}
      >
        <QueryClientProvider client={client}>
          <MemoryRouter>
            <TourProvider>
              <ControlLeaseProvider autoManage>
                <ControlLeaseHeaderControls />
                <OperatorPage />
              </ControlLeaseProvider>
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
    renderOperator(<OperatorPage />);
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
    const { container } = renderOperator(<OperatorPage />);
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
    renderOperator(<OperatorPage />);
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
    renderOperator(<OperatorPage />);
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
    renderOperator(<OperatorPage />);
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
    expect(hoist).toHaveTextContent(/BLOCK/);
    expect(stop).toHaveAttribute('data-cell-state', 'running');

    tagsHandler({
      ...defaultTags,
      fault: true,
      at: new Date().toISOString(),
    });
    await waitFor(() =>
      expect(hoist).toHaveAttribute('data-cell-state', 'fault'),
    );
    expect(hoist).toHaveTextContent(/FAULT/);
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
    renderOperator(<OperatorPage />);
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
    renderOperator(<OperatorPage />);
    expect(await screen.findByText(/Control held by/)).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: 'Take control' }));
    fireEvent.change(await screen.findByLabelText('PIN'), {
      target: { value: '1234' },
    });
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Take control',
      }),
    );
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
    renderOperator(<OperatorPage />);
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
    renderOperator(<OperatorPage />);
    await screen.findByRole('button', { name: 'Take control' });
    fireEvent.click(screen.getByRole('button', { name: 'Take control' }));
    fireEvent.change(await screen.findByLabelText('PIN'), {
      target: { value: '0000' },
    });
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Take control',
      }),
    );
    expect(
      (await screen.findAllByText('PIN does not match')).length,
    ).toBeGreaterThan(0);

    emitSafety({
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
    const view = renderOperator(<OperatorPage />);
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
    renderOperator(<OperatorPage />);
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
    renderOperator(<OperatorPage />);
    expect(
      await screen.findByRole('button', { name: 'Release control' }),
    ).toBeInTheDocument();
  });

  it('reads empty and missing local user ids when merging control (FEAT-A5)', async () => {
    localStorage.removeItem('user');
    const { unmount } = renderOperator(<OperatorPage />);
    expect(await screen.findByText('Hoist Up')).toBeInTheDocument();
    unmount();
    localStorage.setItem('user', JSON.stringify({ id: '   ' }));
    renderOperator(<OperatorPage />);
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
    const view = renderOperator(<OperatorPage />);
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
    renderOperator(<OperatorPage />);
    expect(await screen.findByText(/Control held by/)).toBeInTheDocument();
    expect(screen.getByText(/u2/)).toBeInTheDocument();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Hoist Up' }));
    expect(
      (await screen.findAllByText(/Control held by u2/i)).length,
    ).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Take control' }));
    fireEvent.change(await screen.findByLabelText('PIN'), {
      target: { value: '0000' },
    });
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Take control',
      }),
    );
    expect(
      (await screen.findAllByText('PIN does not match')).length,
    ).toBeGreaterThan(0);

    mockPostWithControl(async (path) => {
      if (path === '/safety/control/release') {
        return Promise.reject('nope');
      }
      return heldControl;
    });
    emitSafety({
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
    renderOperator(<OperatorPage />);
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
    renderOperator(<OperatorPage />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Claim control' }),
    );
    expect(
      await screen.findByText(/Claim exclusive control before moving/i),
    ).toBeInTheDocument();
  });

  it('shows crane readouts from values when top-level metrics are missing', async () => {
    const craneTags = {
      hoistHeightMm: undefined as unknown as number,
      loadKg: undefined as unknown as number,
      speedPct: 0,
      motorRunning: false,
      fault: false,
      commsOk: true,
      trolleyPositionMm: undefined as unknown as number,
      values: {
        'holding.hoistHeightMm': 88,
        'holding.trolleyPosition': 12,
      },
      at: new Date().toISOString(),
    };
    socket.on.mockImplementation(
      (event: string, handler: (p: unknown) => void) => {
        if (event === 'tags.update') handler(craneTags);
      },
    );
    vi.spyOn(api, 'apiGet').mockImplementation(async (path: string) => {
      if (path === '/safety/control') return heldControl as never;
      if (path === '/realtime/tags') return craneTags as never;
      return layout as never;
    });
    mockPostWithControl(async () => ({ ok: true }));
    renderOperator(<OperatorPage />);
    expect(await screen.findByText('Height')).toBeInTheDocument();
    expect(screen.getByText('Load')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('hides crane mimic on p03a21 and shows it again on demo-crane', async () => {
    const pendantTags = {
      ...defaultTags,
      hoistHeightMm: 1250,
      values: { 'holding.hoistHeightMm': 1250 },
    };
    const selectorCell = {
      ...layout.cells[0],
      style: 'selector',
      secondaryRegister: {
        id: 'pb',
        name: 'coil.p03a21.di.owvaDown',
        address: 27,
        kind: 'coil',
      },
    };
    socket.on.mockImplementation(
      (event: string, handler: (p: unknown) => void) => {
        if (event === 'tags.update') handler(pendantTags);
      },
    );
    vi.spyOn(api, 'apiGet').mockImplementation(async (path: string) => {
      if (path === '/safety/control') return heldControl as never;
      if (path === '/realtime/tags') return pendantTags as never;
      return {
        ...layout,
        background: { ...layout.background, name: 'demo-p03a21' },
        cells: [selectorCell],
      } as never;
    });
    mockPostWithControl(async () => ({ ok: true }));
    const { unmount } = renderOperator(<OperatorPage />);
    expect(await screen.findByText('demo-p03a21')).toBeInTheDocument();
    expect(screen.queryByText('Height')).not.toBeInTheDocument();
    expect(document.querySelector('[data-pendant="p03a21"]')).toBeTruthy();
    unmount();

    vi.spyOn(api, 'apiGet').mockImplementation(async (path: string) => {
      if (path === '/safety/control') return heldControl as never;
      if (path === '/realtime/tags') return pendantTags as never;
      return {
        ...layout,
        background: { ...layout.background, name: 'demo-crane' },
        cells: [selectorCell],
      } as never;
    });
    renderOperator(<OperatorPage />);
    expect(await screen.findByText('demo-crane')).toBeInTheDocument();
    expect(await screen.findByText('Height')).toBeInTheDocument();
    expect(document.querySelector('[data-pendant="p03a21"]')).toBeNull();
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
    renderOperator(<OperatorPage />);
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

  it('renders selector rockers with direction activate and center clear', async () => {
    const selectorLayout = {
      ...layout,
      matrix: { rows: 1, cols: 2 },
      background: {
        id: 'bg-p',
        name: 'demo-p03a21',
        cssBackground: 'gray',
        imageUrl: null,
      },
      cells: [
        {
          id: 'sel-motion',
          row: 0,
          col: 0,
          label: 'OWVA up/down',
          style: 'selector',
          isMotion: true,
          requiresSafeAction: false,
          variableSpeed: true,
          primaryRegister: {
            id: 'pa',
            name: 'coil.p03a21.di.owvaUp',
            address: 26,
            kind: 'coil',
          },
          secondaryRegister: {
            id: 'pb',
            name: 'coil.p03a21.di.owvaDown',
            address: 27,
            kind: 'coil',
          },
          feedbackRegister: {
            id: 'fl',
            name: 'coil.p03a21.do.owvaSelector',
            address: 56,
            kind: 'coil',
          },
          statusRegister: null,
        },
        {
          id: 'sel-latch',
          row: 0,
          col: 1,
          label: 'OWFF close/open',
          style: 'selector',
          isMotion: false,
          requiresSafeAction: false,
          variableSpeed: false,
          primaryRegister: {
            id: 'pc',
            name: 'coil.p03a21.di.owffClose',
            address: 40,
            kind: 'coil',
          },
          secondaryRegister: {
            id: 'pd',
            name: 'coil.p03a21.di.owffOpen',
            address: 41,
            kind: 'coil',
          },
          feedbackRegister: null,
          statusRegister: null,
        },
      ],
    };
    const pendantTags = {
      ...defaultTags,
      hoistHeightMm: undefined as unknown as number,
      values: {},
    };
    socket.on.mockImplementation(
      (event: string, handler: (p: unknown) => void) => {
        if (event === 'tags.update') handler(pendantTags);
      },
    );
    vi.spyOn(api, 'apiGet').mockImplementation(async (path: string) => {
      if (path === '/safety/control') return heldControl as never;
      if (path === '/realtime/tags') return pendantTags as never;
      return selectorLayout as never;
    });
    const posts: Array<{ path: string; body: unknown }> = [];
    mockPostWithControl(async (path, body) => {
      posts.push({ path, body });
      if (
        String(path).includes('sel-latch') &&
        (body as { value?: boolean }).value === false
      ) {
        throw new Error('center failed');
      }
      return { ok: true };
    });

    renderOperator(<OperatorPage />);
    expect(await screen.findByText('OWVA up/down')).toBeInTheDocument();
    expect(screen.getByText('demo-p03a21')).toBeInTheDocument();
    expect(screen.queryByText('Height')).not.toBeInTheDocument();

    const up = screen.getByRole('button', { name: 'OWVA up/down up' });
    const down = screen.getByRole('button', { name: 'OWVA up/down down' });
    HTMLElement.prototype.setPointerCapture = vi.fn();
    HTMLElement.prototype.releasePointerCapture = vi.fn();
    HTMLElement.prototype.hasPointerCapture = vi.fn(() => true);

    fireEvent.pointerDown(up);
    await waitFor(() =>
      expect(
        posts.some(
          (p) =>
            p.path === '/hmi/cells/sel-motion/activate' &&
            (p.body as { direction?: string; value?: boolean }).direction ===
              'a' &&
            (p.body as { value?: boolean }).value === true,
        ),
      ).toBe(true),
    );
    fireEvent.pointerUp(up);
    await waitFor(() =>
      expect(
        posts.some(
          (p) =>
            p.path === '/hmi/cells/sel-motion/activate' &&
            (p.body as { direction?: string; value?: boolean }).direction ===
              'a' &&
            (p.body as { value?: boolean }).value === false,
        ),
      ).toBe(true),
    );

    fireEvent.pointerDown(down);
    fireEvent.pointerMove(down, { clientX: -100, clientY: -100 });
    await waitFor(() =>
      expect(
        posts.some(
          (p) =>
            p.path === '/hmi/cells/sel-motion/activate' &&
            (p.body as { direction?: string }).direction === 'b',
        ),
      ).toBe(true),
    );

    fireEvent.pointerDown(up);
    fireEvent.pointerLeave(up);
    fireEvent.pointerDown(down);
    fireEvent.pointerCancel(down);
    fireEvent.pointerDown(up);
    fireEvent(up, new Event('lostpointercapture', { bubbles: true }));

    const close = screen.getByRole('button', {
      name: 'OWFF close/open close',
    });
    fireEvent.pointerDown(close);
    await waitFor(() =>
      expect(
        posts.some(
          (p) =>
            p.path === '/hmi/cells/sel-latch/activate' &&
            (p.body as { direction?: string; value?: boolean }).direction ===
              'a' &&
            (p.body as { value?: boolean }).value === true,
        ),
      ).toBe(true),
    );

    const center = screen.getByRole('button', {
      name: 'OWFF close/open center',
    });
    fireEvent.click(center);
    await waitFor(() =>
      expect(
        posts.some(
          (p) =>
            p.path === '/hmi/cells/sel-latch/activate' &&
            (p.body as { value?: boolean }).value === false &&
            !(p.body as { direction?: string }).direction,
        ),
      ).toBe(true),
    );
  });

  it('covers enable hold, lit lamps, and crane readout fallbacks', async () => {
    const pendantLayout = {
      ...layout,
      matrix: { rows: 1, cols: 2 },
      background: {
        id: 'bg-p',
        name: 'demo-p03a21',
        cssBackground: 'gray',
        imageUrl: null,
      },
      cells: [
        {
          id: 'en1',
          row: 0,
          col: 0,
          label: 'Enable',
          style: 'enable',
          isMotion: false,
          requiresSafeAction: false,
          primaryRegister: {
            id: 'pe',
            name: 'coil.p03a21.di.enable',
            address: 43,
            kind: 'coil',
          },
          feedbackRegister: {
            id: 'fe',
            name: 'coil.p03a21.do.buttonsActive',
            address: 50,
            kind: 'coil',
          },
          statusRegister: null,
        },
        {
          id: 'sel1',
          row: 0,
          col: 1,
          label: 'OWVA up/down',
          style: 'selector',
          isMotion: true,
          requiresSafeAction: false,
          variableSpeed: false,
          primaryRegister: {
            id: 'pa',
            name: 'coil.p03a21.di.owvaUp',
            address: 26,
            kind: 'coil',
          },
          secondaryRegister: {
            id: 'pb',
            name: 'coil.p03a21.di.owvaDown',
            address: 27,
            kind: 'coil',
          },
          feedbackRegister: {
            id: 'fl',
            name: 'coil.p03a21.do.owvaSelector',
            address: 56,
            kind: 'coil',
          },
          statusRegister: null,
        },
      ],
    };
    const litTags = {
      hoistHeightMm: undefined as unknown as number,
      loadKg: undefined as unknown as number,
      speedPct: 0,
      motorRunning: false,
      fault: false,
      commsOk: true,
      trolleyPositionMm: undefined as unknown as number,
      values: {
        'holding.hoistHeightMm': 100,
        'coil.p03a21.do.buttonsActive': false,
        'coil.p03a21.do.owvaSelector': true,
        'coil.p03a21.di.owvaUp': true,
        'coil.p03a21.di.owvaDown': false,
      },
      at: new Date().toISOString(),
    };
    socket.on.mockImplementation(
      (event: string, handler: (p: unknown) => void) => {
        if (event === 'tags.update') handler(litTags);
      },
    );
    vi.spyOn(api, 'apiGet').mockImplementation(async (path: string) => {
      if (path === '/safety/control') return heldControl as never;
      if (path === '/realtime/tags') return litTags as never;
      return pendantLayout as never;
    });
    mockPostWithControl(async () => ({ ok: true }));
    renderOperator(<OperatorPage />);
    expect(
      await screen.findByRole('button', { name: 'Enable' }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    const enable = screen.getByRole('button', { name: 'Enable' });
    expect(enable).toHaveClass('matrix-enable');
    HTMLElement.prototype.setPointerCapture = vi.fn();
    fireEvent.pointerDown(enable);
    fireEvent.lostPointerCapture(enable);
    fireEvent.pointerUp(enable);
    expect(screen.getByTitle('Lamp off')).toBeInTheDocument();
    expect(screen.getByTitle('Lamp on')).toBeInTheDocument();
    const up = screen.getByRole('button', { name: 'OWVA up/down up' });
    expect(up).toHaveAttribute('aria-pressed', 'true');
    up.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        right: 40,
        bottom: 40,
        width: 40,
        height: 40,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    fireEvent.pointerDown(up);
    await waitFor(() => expect(up.className).toMatch(/is-active/));
    // Stay inside the rocker (alternate of pointerLeftElement).
    fireEvent.pointerMove(up, { clientX: 10, clientY: 10 });
    // pagehide while still holding a directional rocker.
    window.dispatchEvent(new Event('pagehide'));
    await waitFor(() =>
      expect(api.apiPost).toHaveBeenCalledWith(
        '/hmi/cells/sel1/activate',
        expect.objectContaining({ value: false, direction: 'a' }),
      ),
    );

    // Leave-while-held path after a fresh press.
    fireEvent.pointerDown(up);
    await waitFor(() => expect(up.className).toMatch(/is-active/));
    fireEvent.pointerMove(up, { clientX: 500, clientY: 500 });
    fireEvent(up, new Event('lostpointercapture', { bubbles: true }));

    // Failed activate on enable clears without deadman release.
    mockPostWithControl(async (path) => {
      if (String(path).includes('/hmi/cells/en1/activate')) {
        throw new Error('enable fail');
      }
      return { ok: true };
    });
    fireEvent.pointerDown(enable);
    await screen.findByText('enable fail');
  });

  it('ignores opposite-side release and latch pointer moves on selectors', async () => {
    const selectorLayout = {
      ...layout,
      matrix: { rows: 1, cols: 2 },
      cells: [
        {
          id: 'sel-motion',
          row: 0,
          col: 0,
          label: 'OWVA up/down',
          style: 'selector',
          isMotion: true,
          requiresSafeAction: false,
          variableSpeed: false,
          primaryRegister: {
            id: 'pa',
            name: 'coil.p03a21.di.owvaUp',
            address: 26,
            kind: 'coil',
          },
          secondaryRegister: {
            id: 'pb',
            name: 'coil.p03a21.di.owvaDown',
            address: 27,
            kind: 'coil',
          },
          feedbackRegister: null,
          statusRegister: null,
        },
        {
          id: 'sel-latch',
          row: 0,
          col: 1,
          label: 'OWFF close/open',
          style: 'selector',
          isMotion: false,
          requiresSafeAction: false,
          variableSpeed: false,
          primaryRegister: {
            id: 'pc',
            name: 'coil.p03a21.di.owffClose',
            address: 40,
            kind: 'coil',
          },
          secondaryRegister: {
            id: 'pd',
            name: 'coil.p03a21.di.owffOpen',
            address: 41,
            kind: 'coil',
          },
          feedbackRegister: null,
          statusRegister: null,
        },
      ],
    };
    mockGetWithControl(selectorLayout);
    const posts: Array<{ path: string; body: unknown }> = [];
    mockPostWithControl(async (path, body) => {
      posts.push({ path, body });
      return { ok: true };
    });
    renderOperator(<OperatorPage />);
    const up = await screen.findByRole('button', { name: 'OWVA up/down up' });
    const down = screen.getByRole('button', { name: 'OWVA up/down down' });
    const close = screen.getByRole('button', {
      name: 'OWFF close/open close',
    });
    HTMLElement.prototype.setPointerCapture = vi.fn();
    HTMLElement.prototype.releasePointerCapture = vi.fn();
    HTMLElement.prototype.hasPointerCapture = vi.fn(() => true);

    fireEvent.pointerDown(up);
    await waitFor(() =>
      expect(
        posts.some(
          (p) =>
            p.path === '/hmi/cells/sel-motion/activate' &&
            (p.body as { value?: boolean; direction?: string }).value ===
              true &&
            (p.body as { direction?: string }).direction === 'a',
        ),
      ).toBe(true),
    );
    const beforeRelease = posts.length;
    // Opposite rocker leave must not clear the held side.
    fireEvent.pointerLeave(down);
    expect(posts.length).toBe(beforeRelease);
    fireEvent.pointerUp(up);

    fireEvent.pointerDown(close);
    fireEvent.pointerMove(close, { clientX: -50, clientY: -50 });
    fireEvent.pointerUp(close);
    await waitFor(() =>
      expect(
        posts.some((p) => p.path === '/hmi/cells/sel-latch/activate'),
      ).toBe(true),
    );
  });

  it('prompts for control when selector motion is pressed without a lease', async () => {
    const freeControl = {
      ...heldControl,
      held: false,
      youHold: false,
      holderUserId: null,
      holderDisplayName: null,
    };
    const selectorLayout = {
      ...layout,
      matrix: { rows: 1, cols: 1 },
      cells: [
        {
          id: 'sel-motion',
          row: 0,
          col: 0,
          label: 'OWVA up/down',
          style: 'selector',
          isMotion: true,
          requiresSafeAction: false,
          variableSpeed: false,
          primaryRegister: {
            id: 'pa',
            name: 'coil.p03a21.di.owvaUp',
            address: 26,
            kind: 'coil',
          },
          secondaryRegister: {
            id: 'pb',
            name: 'coil.p03a21.di.owvaDown',
            address: 27,
            kind: 'coil',
          },
          feedbackRegister: null,
          statusRegister: null,
        },
      ],
    };
    vi.spyOn(api, 'apiGet').mockImplementation(async (path: string) => {
      if (path === '/safety/control') return freeControl as never;
      if (path === '/realtime/tags') return defaultTags as never;
      return selectorLayout as never;
    });
    vi.spyOn(api, 'apiPost').mockImplementation(async (path) => {
      if (typeof path === 'string' && path.startsWith('/safety/control')) {
        return freeControl as never;
      }
      return { ok: true } as never;
    });
    renderOperator(<OperatorPage />, { autoManage: false });
    const up = await screen.findByRole('button', {
      name: 'OWVA up/down up',
    });
    fireEvent.pointerDown(up);
    expect(
      await screen.findByText('Claim exclusive control before moving'),
    ).toBeInTheDocument();
  });

  it('scrolls past buttons on touch and still accepts a tap or a hold', async () => {
    const posts: Array<{ path: string; body: unknown }> = [];
    mockPostWithControl(async (path, body) => {
      posts.push({ path: String(path), body });
      return { ok: true };
    });
    const view = renderOperator(<OperatorPage />);
    const hoist = await screen.findByRole('button', { name: 'Hoist Up' });
    HTMLElement.prototype.setPointerCapture = vi.fn();
    HTMLElement.prototype.releasePointerCapture = vi.fn();
    HTMLElement.prototype.hasPointerCapture = vi.fn(() => true);
    const touch = (
      type:
        | 'pointerDown'
        | 'pointerMove'
        | 'pointerUp'
        | 'pointerCancel'
        | 'pointerLeave',
      pointerId: number,
      x: number,
      y: number,
    ) =>
      fireEvent[type](hoist, {
        pointerType: 'touch',
        pointerId,
        clientX: x,
        clientY: y,
      });

    touch('pointerDown', 9, 10, 10);
    touch('pointerMove', 9, 12, 14);
    touch('pointerMove', 9, 18, 80);
    touch('pointerMove', 9, 18, 120);
    touch('pointerLeave', 9, 18, 120);
    touch('pointerUp', 9, 18, 120);
    touch('pointerMove', 10, 1, 1);
    touch('pointerUp', 11, 1, 1);
    expect(
      posts.some((post) => post.path.includes('/hmi/cells/m1/activate')),
    ).toBe(false);

    touch('pointerDown', 13, 10, 10);
    touch('pointerCancel', 13, 10, 10);
    expect(
      posts.some((post) => post.path.includes('/hmi/cells/m1/activate')),
    ).toBe(false);

    touch('pointerDown', 14, 10, 10);
    touch('pointerUp', 14, 11, 11);
    await waitFor(() =>
      expect(
        posts.some(
          (post) =>
            post.path === '/hmi/cells/m1/activate' &&
            (post.body as { value?: boolean }).value === true,
        ),
      ).toBe(true),
    );
    await waitFor(() =>
      expect(
        posts.some(
          (post) =>
            post.path === '/hmi/cells/m1/activate' &&
            (post.body as { value?: boolean }).value === false,
        ),
      ).toBe(true),
    );

    const beforeHold = posts.length;
    touch('pointerDown', 15, 20, 20);
    await new Promise((resolve) => setTimeout(resolve, 140));
    await waitFor(() => expect(posts.length).toBeGreaterThan(beforeHold));
    touch('pointerUp', 15, 20, 22);
    await waitFor(() =>
      expect(
        posts.filter(
          (post) =>
            post.path === '/hmi/cells/m1/activate' &&
            (post.body as { value?: boolean }).value === false,
        ).length,
      ).toBeGreaterThan(0),
    );

    const beforeCancel = posts.length;
    touch('pointerDown', 17, 30, 30);
    await new Promise((resolve) => setTimeout(resolve, 140));
    await waitFor(() => expect(posts.length).toBeGreaterThan(beforeCancel));
    touch('pointerCancel', 17, 30, 30);

    touch('pointerDown', 16, 4, 4);
    view.unmount();
  });

  it('covers a plain pendant button, a dark selector lamp, and crane enable', async () => {
    const tags = {
      ...defaultTags,
      values: {
        'coil.p03a21.do.buttonsActive': true,
        'coil.p03a21.do.owvaSelector': false,
      },
    };
    socket.on.mockImplementation(
      (event: string, handler: (payload: unknown) => void) => {
        if (event === 'tags.update') handler(tags);
      },
    );
    vi.spyOn(api, 'apiGet').mockImplementation(async (path: string) => {
      if (path === '/safety/control')
        return { ...heldControl, youHold: false } as never;
      if (path === '/realtime/tags') return tags as never;
      return {
        ...layout,
        matrix: { rows: 1, cols: 3 },
        background: {
          id: 'bg-p',
          name: 'demo-p03a21',
          cssBackground: '',
          imageUrl: null,
        },
        cells: [
          {
            id: 'pb1',
            row: 0,
            col: 0,
            label: 'Buttons active',
            style: 'pushbutton',
            isMotion: false,
            requiresSafeAction: false,
            primaryRegister: {
              id: 'p1',
              name: 'coil.p03a21.di.buttonsActive',
              address: 42,
              kind: 'coil',
            },
            feedbackRegister: {
              id: 'f1',
              name: 'coil.p03a21.do.buttonsActive',
              address: 50,
              kind: 'coil',
            },
            statusRegister: null,
          },
          {
            id: 'plain',
            row: 0,
            col: 2,
            label: 'Teach',
            style: 'pushbutton',
            isMotion: true,
            requiresSafeAction: false,
            primaryRegister: {
              id: 'p2',
              name: 'coil.p03a21.di.teachPipeMiddle',
              address: 21,
              kind: 'coil',
            },
            feedbackRegister: null,
            statusRegister: null,
          },
          {
            id: 'sel-off',
            row: 0,
            col: 1,
            label: 'OWVA up/down',
            style: 'selector',
            isMotion: true,
            requiresSafeAction: false,
            variableSpeed: false,
            primaryRegister: {
              id: 'pa',
              name: 'coil.p03a21.di.owvaUp',
              address: 26,
              kind: 'coil',
            },
            secondaryRegister: {
              id: 'pb',
              name: 'coil.p03a21.di.owvaDown',
              address: 27,
              kind: 'coil',
            },
            feedbackRegister: {
              id: 'fl',
              name: 'coil.p03a21.do.owvaSelector',
              address: 56,
              kind: 'coil',
            },
            statusRegister: null,
          },
        ],
        overlays: [],
        backgrounds: [],
      } as never;
    });
    mockPostWithControl(async () => ({ ok: true }));
    renderOperator(<OperatorPage />);
    const plain = await screen.findByRole('button', { name: 'Buttons active' });
    fireEvent.lostPointerCapture(plain);
    expect(screen.getByTitle('Lamp on')).toBeInTheDocument();
    expect(screen.getByTitle('Lamp off')).toBeInTheDocument();
    cleanup();

    vi.spyOn(api, 'apiGet').mockImplementation(async (path: string) => {
      if (path === '/safety/control') return heldControl as never;
      if (path === '/realtime/tags') return defaultTags as never;
      return {
        ...layout,
        cells: [
          {
            ...layout.cells[0],
            id: 'en-crane',
            label: 'Enable',
            style: 'enable',
            isMotion: false,
          },
        ],
      } as never;
    });
    renderOperator(<OperatorPage />);
    expect(await screen.findByRole('button', { name: 'Enable' })).toHaveClass(
      'matrix-enable',
    );
  });
});
