import { beforeEach, describe, expect, it, vi } from 'vitest';

const ioMock = vi.fn(() => ({ id: 'sock' }));

vi.mock('socket.io-client', () => ({
  io: ((...args: unknown[]) =>
    ioMock(...(args as Parameters<typeof ioMock>))) as typeof ioMock,
}));

describe('getRealtimeSocket', () => {
  beforeEach(() => {
    ioMock.mockClear();
    vi.resetModules();
  });

  it('creates a singleton socket', async () => {
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
      }),
    );
  });
});
