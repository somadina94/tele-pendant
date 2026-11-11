import { resetRealtimeSocket } from './realtime';

const PUBLIC_PATHS = new Set(['/', '/face']);

/** Drop local session state (token + cached user). */
export function clearSession(): void {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('user');
  resetRealtimeSocket();
}

/**
 * TP-40: revoke server-side JWT (tokenVersion bump) then clear local state.
 * Uses fetch directly to avoid a circular import with api.ts.
 * Always clears locally even if the revoke call fails.
 */
export async function logoutSession(): Promise<void> {
  const token = localStorage.getItem('accessToken');
  if (token) {
    try {
      await fetch('/api/v1/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
      });
    } catch {
      /* still clear local session */
    }
  }
  clearSession();
}

/** True when this path should not force a login redirect on 401. */
export function isPublicAuthPath(pathname = window.location.pathname): boolean {
  return PUBLIC_PATHS.has(pathname);
}

type SoftLoginRedirect = () => void;
let softLoginRedirect: SoftLoginRedirect | null = null;

/** Prefer React Router replace so Operator unmounts before Login paints. */
export function registerSoftLoginRedirect(fn: SoftLoginRedirect | null): void {
  softLoginRedirect = fn;
}

/**
 * Clear the session and send the browser to login when a protected
 * screen still has a dead token (page refresh or mid-session 401).
 */
export function redirectToLogin(): void {
  clearSession();
  // Prefer soft Router replace whenever the app bridge is mounted so
  // Operator unmounts before Login paints (and MemoryRouter tests work).
  if (softLoginRedirect) {
    softLoginRedirect();
    return;
  }
  if (isPublicAuthPath()) return;
  window.location.replace('/');
}
