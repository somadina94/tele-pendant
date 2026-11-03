import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearSession, isPublicAuthPath, redirectToLogin } from './session';

describe('session', () => {
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('clears token and user', () => {
    localStorage.setItem('accessToken', 'tok');
    localStorage.setItem('user', '{"id":"1"}');
    clearSession();
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
  });

  it('knows public auth paths', () => {
    expect(isPublicAuthPath('/')).toBe(true);
    expect(isPublicAuthPath('/face')).toBe(true);
    expect(isPublicAuthPath('/operator')).toBe(false);
  });

  it('redirects to login from protected routes', () => {
    localStorage.setItem('accessToken', 'tok');
    const assign = vi.fn();
    vi.stubGlobal('location', {
      pathname: '/operator',
      assign,
    });
    redirectToLogin();
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(assign).toHaveBeenCalledWith('/');
  });

  it('clears without redirect on public paths', () => {
    localStorage.setItem('accessToken', 'tok');
    const assign = vi.fn();
    vi.stubGlobal('location', {
      pathname: '/',
      assign,
    });
    redirectToLogin();
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(assign).not.toHaveBeenCalled();
  });
});
