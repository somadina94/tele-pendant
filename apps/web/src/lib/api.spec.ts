import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  apiDelete,
  apiDownload,
  apiGet,
  apiPatch,
  apiPost,
  apiPut,
} from './api';

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

  it('clears the session and redirects on 401 from protected calls', async () => {
    localStorage.setItem('accessToken', 'tok');
    localStorage.setItem('user', '{"id":"1"}');
    const assign = vi.fn();
    vi.stubGlobal('location', { pathname: '/operator', assign });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ message: 'Unauthorized' }),
      }),
    );

    await expect(apiGet('/hmi/layout')).rejects.toThrow('Unauthorized');
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(assign).toHaveBeenCalledWith('/');
  });

  it('does not redirect on login 401', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { pathname: '/', assign });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ message: 'Invalid credentials' }),
      }),
    );

    await expect(
      apiPost('/auth/login', { email: 'a', password: 'b' }),
    ).rejects.toThrow('Invalid credentials');
    expect(assign).not.toHaveBeenCalled();
  });

  it('clears a dead token on public routes without navigating away', async () => {
    localStorage.setItem('accessToken', 'tok');
    const assign = vi.fn();
    vi.stubGlobal('location', { pathname: '/face', assign });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () =>
          JSON.stringify({ message: ['Unauthorized', 'jwt expired'] }),
      }),
    );

    await expect(apiGet('/auth/me')).rejects.toThrow(
      'Unauthorized, jwt expired',
    );
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(assign).not.toHaveBeenCalled();
  });

  it('falls back when the error body is empty', async () => {
    vi.stubGlobal('location', { pathname: '/', assign: vi.fn() });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        text: async () => '',
      }),
    );
    await expect(apiGet('/health')).rejects.toThrow('Request failed (502)');
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

  it('downloads blobs and triggers a file save', async () => {
    const blob = new Blob(['a,b\n1,2'], { type: 'text/csv' });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => blob,
    });
    vi.stubGlobal('fetch', fetchMock);
    const click = vi.fn();
    const anchor = {
      href: '',
      download: '',
      click,
    } as unknown as HTMLAnchorElement;
    const createElement = vi
      .spyOn(document, 'createElement')
      .mockReturnValue(anchor);
    const createObjectURL = vi.fn(() => 'blob:mock');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', {
      createObjectURL,
      revokeObjectURL,
    });

    await apiDownload('/audit/export', 'audit.csv');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/audit/export',
      expect.objectContaining({ headers: {} }),
    );
    expect(anchor.download).toBe('audit.csv');
    expect(click).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock');
    createElement.mockRestore();
  });

  it('surfaces download failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'export failed',
      }),
    );
    await expect(apiDownload('/audit/export', 'audit.csv')).rejects.toThrow(
      'export failed',
    );
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
