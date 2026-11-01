import { describe, expect, it, vi } from 'vitest';
import { pinLocale, readLocale, useT } from './i18n';

describe('i18n', () => {
  it('follows the browser until a locale is pinned', () => {
    localStorage.clear();
    expect(readLocale()).toBe('en');
    localStorage.setItem(
      'user',
      JSON.stringify({ locale: 'es' }),
    );
    expect(readLocale()).toBe('en');
    localStorage.setItem('localePinned', '1');
    localStorage.removeItem('localeOverride');
    expect(readLocale()).toBe('es');
  });

  it('uses a pinned override and ignores a bad user blob', () => {
    localStorage.setItem('localePinned', '1');
    localStorage.setItem('localeOverride', 'es-MX');
    localStorage.setItem('user', '{');
    expect(readLocale()).toBe('es');
    pinLocale('en');
    expect(localStorage.getItem('localeOverride')).toBe('en');
    expect(localStorage.getItem('user')).toBeNull();
    pinLocale('es');
    expect(localStorage.getItem('localeOverride')).toBe('es');
  });

  it('pins into an existing user and survives storage failures', () => {
    localStorage.setItem('user', JSON.stringify({ locale: 'en', email: 'a' }));
    pinLocale('es');
    expect(JSON.parse(localStorage.getItem('user') || '{}').locale).toBe('es');
    pinLocale('en');
    const getItem = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('blocked');
      });
    expect(readLocale()).toBe('en');
    getItem.mockRestore();
  });

  it('uses english when a pinned user has no locale and the browser is gone', () => {
    localStorage.clear();
    localStorage.setItem('localePinned', '1');
    localStorage.setItem('user', JSON.stringify({ email: 'a' }));
    expect(readLocale()).toBe('en');
    vi.stubGlobal('navigator', undefined);
    expect(readLocale()).toBe('en');
    vi.unstubAllGlobals();
  });

  it('translates known API sentences and leaves the rest', () => {
    localStorage.setItem('localePinned', '1');
    localStorage.setItem('localeOverride', 'es');
    const { t, terror } = useT();
    expect(t('signIn')).toBe('Entrar');
    expect(t('missing-key')).toBe('missing-key');
    expect(terror('No face detected')).toBe('No se detectó un rostro');
    expect(terror('blocked')).toBe('blocked');
    localStorage.setItem('localeOverride', 'en');
    expect(useT().t('signIn')).toBe('Sign in');
  });
});
