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
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1') return true;
    // Phone testing via ngrok. Production stays on FRONTEND_URL only.
    return (
      host === 'ngrok.io' ||
      host.endsWith('.ngrok.io') ||
      host === 'ngrok.app' ||
      host.endsWith('.ngrok.app') ||
      host === 'ngrok.dev' ||
      host.endsWith('.ngrok.dev') ||
      host.endsWith('.ngrok-free.app') ||
      host.endsWith('.ngrok-free.dev')
    );
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
