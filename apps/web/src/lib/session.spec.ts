import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearSession,
  isPublicAuthPath,
  logoutSession,
  redirectToLogin,
  registerSoftLoginRedirect,
} from './session';

describe('session', () => {
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('clears token and user', () => {
    localStorage.setItem('accessToken', 'tok');
    localStorage.setItem('user', '{"id":"1"}');
    clearSession();
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
  });

  it('revokes the server session on logout then clears local state (TP-40)', async () => {
    localStorage.setItem('accessToken', 'tok');
    localStorage.setItem('user', '{"id":"1"}');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    await logoutSession();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/auth/logout',
      expect.objectContaining({
        method: 'POST',
        headers: { Authorization: 'Bearer tok' },
      }),
    );
    expect(localStorage.getItem('accessToken')).toBeNull();
  });

  it('still clears local state when logout revoke fails', async () => {
    localStorage.setItem('accessToken', 'tok');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await logoutSession();
    expect(localStorage.getItem('accessToken')).toBeNull();
  });

  it('skips the revoke call when there is no token', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await logoutSession();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('knows public auth paths', () => {
    expect(isPublicAuthPath('/')).toBe(true);
    expect(isPublicAuthPath('/face')).toBe(true);
    expect(isPublicAuthPath('/operator')).toBe(false);
  });

  it('redirects to login from protected routes', () => {
    localStorage.setItem('accessToken', 'tok');
    const replace = vi.fn();
    vi.stubGlobal('location', {
      pathname: '/operator',
      replace,
      assign: vi.fn(),
    });
    redirectToLogin();
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(replace).toHaveBeenCalledWith('/');
  });

  it('uses a soft React Router redirect when registered', () => {
    localStorage.setItem('accessToken', 'tok');
    const soft = vi.fn();
    registerSoftLoginRedirect(soft);
    const replace = vi.fn();
    vi.stubGlobal('location', {
      pathname: '/operator',
      replace,
      assign: vi.fn(),
    });
    redirectToLogin();
    expect(soft).toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    registerSoftLoginRedirect(null);
  });

  it('prefers soft redirect even on a public pathname', () => {
    localStorage.setItem('accessToken', 'tok');
    const soft = vi.fn();
    registerSoftLoginRedirect(soft);
    const replace = vi.fn();
    vi.stubGlobal('location', {
      pathname: '/',
      replace,
      assign: vi.fn(),
    });
    redirectToLogin();
    expect(soft).toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    registerSoftLoginRedirect(null);
  });

  it('clears without redirect on public paths', () => {
    localStorage.setItem('accessToken', 'tok');
    const replace = vi.fn();
    vi.stubGlobal('location', {
      pathname: '/',
      replace,
      assign: vi.fn(),
    });
    redirectToLogin();
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(replace).not.toHaveBeenCalled();
  });
});
