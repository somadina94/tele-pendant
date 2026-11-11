import { afterEach, describe, expect, it, vi } from 'vitest';
import { getControlClientId } from './control-client-id';

describe('getControlClientId', () => {
  afterEach(() => {
    sessionStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('reuses an existing sessionStorage id', () => {
    sessionStorage.setItem('controlClientId', 'kept-id');
    expect(getControlClientId()).toBe('kept-id');
  });

  it('creates a uuid when none is stored', () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'uuid-1' });
    expect(getControlClientId()).toBe('uuid-1');
    expect(sessionStorage.getItem('controlClientId')).toBe('uuid-1');
  });

  it('falls back without randomUUID', () => {
    vi.stubGlobal('crypto', {});
    const id = getControlClientId();
    expect(id).toMatch(/^web-\d+-/);
    expect(sessionStorage.getItem('controlClientId')).toBe(id);
  });

  it('returns a fallback when sessionStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(getControlClientId()).toMatch(/^web-fallback-\d+$/);
  });
});
