import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from './api';

describe('api helpers', () => {
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('gets with and without bearer token', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ apiVersion: 'v1', data: { ok: true } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiGet<{ ok: boolean }>('/health')).resolves.toEqual({
      ok: true,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/health',
      expect.objectContaining({
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    localStorage.setItem('accessToken', 'tok');
    await apiGet('/x');
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/v1/x',
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer tok',
          'Content-Type': 'application/json',
        },
      }),
    );
  });

  it('posts payload or omits body and surfaces errors', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ apiVersion: 'v1', data: { id: 1 } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ apiVersion: 'v1', data: { ok: true } }),
      })
      .mockResolvedValueOnce({
        ok: false,
        text: async () => 'boom',
      })
      .mockResolvedValueOnce({
        ok: false,
        text: async () => 'nope',
      });
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiPost('/a', { x: 1 })).resolves.toEqual({ id: 1 });
    expect(fetchMock.mock.calls[0][1].body).toBe(JSON.stringify({ x: 1 }));

    await expect(apiPost('/b')).resolves.toEqual({ ok: true });
    expect(fetchMock.mock.calls[1][1].body).toBeUndefined();

    await expect(apiGet('/fail')).rejects.toThrow('boom');
    await expect(apiPost('/fail', {})).rejects.toThrow('nope');
  });

  it('patches payload or omits body and surfaces errors', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ apiVersion: 'v1', data: { id: 'c1' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ apiVersion: 'v1', data: { ok: true } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ apiVersion: 'v1', data: { ok: true } }),
      })
      .mockResolvedValueOnce({
        ok: false,
        text: async () => 'denied',
      });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      apiPatch('/plc/connections/1', { host: '10.0.0.1' }),
    ).resolves.toEqual({
      id: 'c1',
    });
    expect(fetchMock.mock.calls[0][1].method).toBe('PATCH');
    expect(fetchMock.mock.calls[0][1].body).toBe(
      JSON.stringify({ host: '10.0.0.1' }),
    );

    await expect(apiPatch('/hmi/registers/r1')).resolves.toEqual({ ok: true });
    expect(fetchMock.mock.calls[1][1].body).toBeUndefined();

    await expect(
      apiPut('/safety/roles', { eStopRegisterId: 'r1' }),
    ).resolves.toEqual({
      ok: true,
    });
    expect(fetchMock.mock.calls[2][1].method).toBe('PUT');
    await expect(apiPatch('/fail', {})).rejects.toThrow('denied');
  });

  it('deletes and surfaces errors', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ apiVersion: 'v1', data: { ok: true } }),
      })
      .mockResolvedValueOnce({
        ok: false,
        text: async () => 'gone',
      });
    vi.stubGlobal('fetch', fetchMock);
    await expect(apiDelete('/hmi/cells/1')).resolves.toEqual({ ok: true });
    expect(fetchMock.mock.calls[0][1].method).toBe('DELETE');
    expect(fetchMock.mock.calls[0][1].body).toBeUndefined();
    await expect(apiDelete('/fail')).rejects.toThrow('gone');
  });
});
