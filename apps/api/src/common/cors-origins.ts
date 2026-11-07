/**
 * TP-44: CORS allowlist — FRONTEND_URL (+ optional CORS_EXTRA_ORIGINS),
 * and localhost / 127.0.0.1 in non-production only.
 */

function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/$/, '');
}

export function corsAllowedOrigins(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const origins = new Set<string>();
  const frontend = env.FRONTEND_URL?.trim();
  if (frontend) origins.add(normalizeOrigin(frontend));

  const extras = env.CORS_EXTRA_ORIGINS?.split(',') ?? [];
  for (const entry of extras) {
    const trimmed = entry.trim();
    if (trimmed) origins.add(normalizeOrigin(trimmed));
  }
  return [...origins];
}

export function isCorsOriginAllowed(
  origin: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  // Non-browser clients (curl, same-origin navigations) omit Origin.
  if (!origin) return true;

  const normalized = normalizeOrigin(origin);
  if (corsAllowedOrigins(env).includes(normalized)) return true;

  if ((env.NODE_ENV ?? 'development') === 'production') return false;

  try {
    const url = new URL(normalized);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

/** Nest / Express `cors` and Socket.IO compatible origin callback. */
export function corsOriginDelegate(
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void,
  env: NodeJS.ProcessEnv = process.env,
): void {
  callback(null, isCorsOriginAllowed(origin, env));
}
