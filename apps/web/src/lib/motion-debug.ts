/**
 * Browser motion trace. On in Vite DEV, VITE_MOTION_DEBUG=1 builds,
 * localStorage.MOTION_DEBUG=1, or ?motionDebug=1. Filter console with `[motion]`.
 */
export function motionDebugEnabled(): boolean {
  if (typeof window !== 'undefined') {
    try {
      if (window.localStorage.getItem('MOTION_DEBUG') === '1') return true;
      if (new URLSearchParams(window.location.search).get('motionDebug') === '1') {
        return true;
      }
    } catch {
      // ignore storage / URL errors
    }
  }
  if (import.meta.env.VITE_MOTION_DEBUG === '1') return true;
  // Vitest sets DEV; keep console quiet unless explicitly opted in.
  if (import.meta.env.MODE === 'test') return false;
  return Boolean(import.meta.env.DEV);
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
