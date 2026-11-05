import type { UserRole } from '@tele-pendant/shared';
import { isUserRole } from '@tele-pendant/shared';
import type { PublicUser } from './api';

export function getStoredUser(): PublicUser | null {
  try {
    const raw = localStorage.getItem('user');
    if (!raw) return null;
    return JSON.parse(raw) as PublicUser;
  } catch {
    return null;
  }
}

export function getStoredUserRole(): UserRole | null {
  const role = getStoredUser()?.role;
  return isUserRole(role) ? role : null;
}

export function isAdminUser(): boolean {
  return getStoredUserRole() === 'admin';
}

export function isSupervisorOrAdmin(): boolean {
  const role = getStoredUserRole();
  return role === 'supervisor' || role === 'admin';
}
