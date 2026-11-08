/**
 * Browser motion trace — local DEV only (never production builds).
 * Opt in with localStorage.MOTION_DEBUG=1 while running Vite DEV.
 * Filter console with `[motion]`.
 */
export function motionDebugEnabled(): boolean {
  if (!import.meta.env.DEV) return false;
  if (import.meta.env.MODE === 'test') return false;
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem('MOTION_DEBUG') === '1';
  } catch {
    return false;
  }
}

export function motionDebug(
  event: string,
  details?: Record<string, unknown>,
): void {
  if (!motionDebugEnabled()) return;
  if (details) {
    console.info(`[motion] ${event}`, details);
    return;
  }
  console.info(`[motion] ${event}`);
}
