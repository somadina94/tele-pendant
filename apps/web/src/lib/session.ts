const PUBLIC_PATHS = new Set(['/', '/face']);

/** Drop local session state (token + cached user). */
export function clearSession(): void {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('user');
}

/** True when this path should not force a login redirect on 401. */
export function isPublicAuthPath(pathname = window.location.pathname): boolean {
  return PUBLIC_PATHS.has(pathname);
}

/**
 * Clear the session and send the browser to login when a protected
 * screen still has a dead token (page refresh or mid-session 401).
 */
export function redirectToLogin(): void {
  clearSession();
  if (isPublicAuthPath()) return;
  window.location.assign('/');
}
