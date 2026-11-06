import { afterEach, describe, expect, it } from 'vitest';
import {
  getStoredUser,
  getStoredUserRole,
  isAdminUser,
  isSupervisorOrAdmin,
} from './user-session';

describe('user-session', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('reads stored users and roles', () => {
    expect(getStoredUser()).toBeNull();
    expect(getStoredUserRole()).toBeNull();
    localStorage.setItem(
      'user',
      JSON.stringify({
        id: '1',
        email: 'a@example.com',
        role: 'admin',
        displayName: 'Admin',
      }),
    );
    expect(getStoredUser()?.email).toBe('a@example.com');
    expect(getStoredUserRole()).toBe('admin');
    expect(isAdminUser()).toBe(true);
    expect(isSupervisorOrAdmin()).toBe(true);
  });

  it('ignores corrupt storage and invalid roles', () => {
    localStorage.setItem('user', '{not-json');
    expect(getStoredUser()).toBeNull();
    localStorage.setItem('user', JSON.stringify({ role: 'guest' }));
    expect(getStoredUserRole()).toBeNull();
    localStorage.setItem(
      'user',
      JSON.stringify({ role: 'operator', email: 'o@example.com' }),
    );
    expect(isSupervisorOrAdmin()).toBe(false);
  });
});
