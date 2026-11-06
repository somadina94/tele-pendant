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
