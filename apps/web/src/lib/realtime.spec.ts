import { beforeEach, describe, expect, it, vi } from 'vitest';

const disconnect = vi.fn();
const ioMock = vi.fn(() => ({ id: 'sock', disconnect }));

vi.mock('socket.io-client', () => ({
  io: ((...args: unknown[]) =>
    ioMock(...(args as Parameters<typeof ioMock>))) as typeof ioMock,
}));

describe('getRealtimeSocket', () => {
  beforeEach(() => {
    ioMock.mockClear();
    disconnect.mockClear();
    localStorage.clear();
    vi.resetModules();
  });

  it('creates a singleton socket with the access token (TP-37)', async () => {
    localStorage.setItem('accessToken', 'tok-1');
    const { getRealtimeSocket } = await import('./realtime');
    const a = getRealtimeSocket();
    const b = getRealtimeSocket();
    expect(a).toBe(b);
    expect(ioMock).toHaveBeenCalledTimes(1);
    expect(ioMock).toHaveBeenCalledWith(
      '/realtime',
      expect.objectContaining({
        path: '/socket.io',
        withCredentials: true,
        auth: { token: 'tok-1' },
      }),
    );
  });

  it('reconnects when the access token changes', async () => {
    localStorage.setItem('accessToken', 'tok-1');
    const mod = await import('./realtime');
    mod.getRealtimeSocket();
    localStorage.setItem('accessToken', 'tok-2');
    mod.getRealtimeSocket();
    expect(disconnect).toHaveBeenCalled();
    expect(ioMock).toHaveBeenCalledTimes(2);
    expect(ioMock).toHaveBeenLastCalledWith(
      '/realtime',
      expect.objectContaining({ auth: { token: 'tok-2' } }),
    );
  });

  it('connects without auth when localStorage is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { getRealtimeSocket, resetRealtimeSocket } =
      await import('./realtime');
    resetRealtimeSocket();
    getRealtimeSocket();
    expect(ioMock).toHaveBeenCalledWith(
      '/realtime',
      expect.objectContaining({ auth: {} }),
    );
  });
});
