const STORAGE_KEY = 'controlClientId';

/** Stable id for this browser tab so control lease is per device/session. */
export function getControlClientId(): string {
  try {
    const existing = sessionStorage.getItem(STORAGE_KEY)?.trim();
    if (existing) return existing;
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `web-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem(STORAGE_KEY, id);
    return id;
  } catch {
    return `web-fallback-${Date.now()}`;
  }
}
