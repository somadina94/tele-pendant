import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  canRepromptForCamera,
  queryCameraPermissionState,
  watchCameraPermission,
} from './camera-permission';

describe('canRepromptForCamera', () => {
  it('allows retry for non-permission errors', () => {
    expect(canRepromptForCamera('denied', false)).toBe(true);
  });

  it('allows retry only while the browser can still prompt', () => {
    expect(canRepromptForCamera('prompt', true)).toBe(true);
    expect(canRepromptForCamera('denied', true)).toBe(false);
    expect(canRepromptForCamera('unsupported', true)).toBe(false);
  });
});

describe('camera permission API', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('queries permission state', async () => {
    expect(await queryCameraPermissionState()).toBe('unsupported');
    vi.stubGlobal('navigator', {
      permissions: {
        query: vi.fn().mockResolvedValue({ state: 'granted' }),
      },
    });
    expect(await queryCameraPermissionState()).toBe('granted');
    vi.stubGlobal('navigator', {
      permissions: {
        query: vi.fn().mockRejectedValue(new Error('nope')),
      },
    });
    expect(await queryCameraPermissionState()).toBe('unsupported');
  });

  it('watches permission changes and cleans up', async () => {
    const onChange = vi.fn();
    const handlerStore: { handler?: () => void } = {};
    const status = {
      state: 'prompt',
      addEventListener: vi.fn((_event: string, handler: () => void) => {
        handlerStore.handler = handler;
      }),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal('navigator', {
      permissions: {
        query: vi.fn().mockResolvedValue(status),
      },
    });
    const stop = watchCameraPermission(onChange);
    await vi.waitFor(() => expect(onChange).toHaveBeenCalledWith('prompt'));
    handlerStore.handler?.();
    expect(onChange).toHaveBeenCalledWith('prompt');
    stop();
    expect(status.removeEventListener).toHaveBeenCalled();
  });

  it('skips permission callbacks after watch teardown', async () => {
    const onChange = vi.fn();
    let fulfill!: (value: {
      state: string;
      addEventListener: ReturnType<typeof vi.fn>;
      removeEventListener: ReturnType<typeof vi.fn>;
    }) => void;
    const status = {
      state: 'granted',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal('navigator', {
      permissions: {
        query: vi.fn(
          () =>
            new Promise((res) => {
              fulfill = res;
            }),
        ),
      },
    });
    const stop = watchCameraPermission(onChange);
    await Promise.resolve();
    stop();
    fulfill(status);
    await Promise.resolve();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not notify after watch is cancelled early', async () => {
    const onChange = vi.fn();
    vi.stubGlobal('navigator', {
      permissions: {
        query: vi.fn(
          () =>
            new Promise<{ state: string; addEventListener: typeof vi.fn }>(
              () => {},
            ),
        ),
      },
    });
    const stop = watchCameraPermission(onChange);
    stop();
    await Promise.resolve();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('reports unsupported when permissions API is missing', async () => {
    const onChange = vi.fn();
    vi.stubGlobal('navigator', {});
    watchCameraPermission(onChange);
    await vi.waitFor(() =>
      expect(onChange).toHaveBeenCalledWith('unsupported'),
    );
    onChange.mockClear();
    watchCameraPermission(onChange);
    await vi.waitFor(() =>
      expect(onChange).toHaveBeenCalledWith('unsupported'),
    );
  });

  it('skips unsupported callbacks after teardown on query failure', async () => {
    const onChange = vi.fn();
    let fail!: (err: Error) => void;
    vi.stubGlobal('navigator', {
      permissions: {
        query: vi.fn(
          () =>
            new Promise((_, rej) => {
              fail = rej;
            }),
        ),
      },
    });
    const stop = watchCameraPermission(onChange);
    await Promise.resolve();
    stop();
    fail(new Error('nope'));
    await Promise.resolve();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('aborts the probe when cancelled after the first microtask', async () => {
    const onChange = vi.fn();
    let fulfill!: (value: {
      state: string;
      addEventListener: ReturnType<typeof vi.fn>;
      removeEventListener: ReturnType<typeof vi.fn>;
    }) => void;
    vi.stubGlobal('navigator', {
      permissions: {
        query: vi.fn(
          () =>
            new Promise((res) => {
              fulfill = res;
            }),
        ),
      },
    });
    const stop = watchCameraPermission(onChange);
    await Promise.resolve();
    stop();
    fulfill({
      state: 'granted',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    await Promise.resolve();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not emit unsupported when watch stops before the probe runs', async () => {
    const onChange = vi.fn();
    vi.stubGlobal('navigator', {});
    const stop = watchCameraPermission(onChange);
    stop();
    await Promise.resolve();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('reports unsupported when watch setup fails', async () => {
    const onChange = vi.fn();
    vi.stubGlobal('navigator', {
      permissions: {
        query: vi.fn().mockRejectedValue(new Error('nope')),
      },
    });
    watchCameraPermission(onChange);
    await vi.waitFor(() =>
      expect(onChange).toHaveBeenCalledWith('unsupported'),
    );
  });
});
