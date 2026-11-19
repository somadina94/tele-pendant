import Constants from 'expo-constants';
import { getControlClientId } from './control-client-id';
import { notifyUnauthorized } from './session';
import { ApiStatusError } from './session-failure';
import { clearAccessToken } from './token-storage';

/** API base baked in by app.config.js (`extra.apiUrl` or `EXPO_PUBLIC_API_URL`). */
export function getApiBase(): string {
  const fromExtra = Constants.expoConfig?.extra?.apiUrl;
  if (typeof fromExtra === 'string' && fromExtra.trim()) {
    return fromExtra.trim().replace(/\/$/, '');
  }
  const fromEnv = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  throw new Error(
    'Set EXPO_PUBLIC_API_URL or APP_URL before building the phone app.',
  );
}

function isAuthBootstrapPath(path: string): boolean {
  return (
    path === '/auth/login' ||
    path === '/auth/login/otp' ||
    path === '/auth/login/otp/resend' ||
    path === '/auth/face/login'
  );
}

function rethrowFetch(base: string, err: unknown): never {
  if (base.startsWith('http://')) {
    throw new Error(
      `Cannot reach ${base}. This API is plain HTTP. Rebuild the Android app with EXPO_PUBLIC_ALLOW_HTTP=true, or leave that setting empty when the API address starts with http://.`,
    );
  }
  throw err;
}

async function throwIfNotOk(res: Response, path: string): Promise<void> {
  if (res.ok) return;
  if (res.status === 401 && !isAuthBootstrapPath(path)) {
    await clearAccessToken();
    notifyUnauthorized();
  }
  const text = await res.text();
  let message = text;
  try {
    const parsed = JSON.parse(text) as { message?: string | string[] };
    if (typeof parsed.message === 'string') message = parsed.message;
    else if (Array.isArray(parsed.message)) message = parsed.message.join(', ');
  } catch {
    message = text;
  }
  throw new ApiStatusError(
    message || `Request failed (${res.status})`,
    res.status,
  );
}

async function apiSend<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
  token?: string | null,
): Promise<T> {
  const base = getApiBase();
  const controlClientId = await getControlClientId();
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'X-Control-Client-Id': controlClientId,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      // Live tags must not reuse a conditional/304 cache entry (prod jump).
      cache: 'no-store',
    });
  } catch (err) {
    rethrowFetch(base, err);
  }
  await throwIfNotOk(res, path);
  const json = (await res.json()) as { data: T };
  return json.data;
}

export async function apiPost<T>(
  path: string,
  body?: unknown,
  token?: string | null,
): Promise<T> {
  return apiSend<T>('POST', path, body, token);
}

export async function apiPut<T>(
  path: string,
  body: unknown,
  token: string,
): Promise<T> {
  return apiSend<T>('PUT', path, body, token);
}

export async function apiPatch<T>(
  path: string,
  body: unknown,
  token: string,
): Promise<T> {
  return apiSend<T>('PATCH', path, body, token);
}

export async function apiDelete<T>(path: string, token: string): Promise<T> {
  return apiSend<T>('DELETE', path, undefined, token);
}

export async function apiGet<T>(path: string, token: string): Promise<T> {
  return apiSend<T>('GET', path, undefined, token);
}

export async function apiUploadFile<T>(
  path: string,
  file: { uri: string; name: string; type: string },
  token: string,
): Promise<T> {
  const base = getApiBase();
  const controlClientId = await getControlClientId();
  const body = new FormData();
  body.append('file', {
    uri: file.uri,
    name: file.name,
    type: file.type,
  } as unknown as Blob);
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Control-Client-Id': controlClientId,
      },
      body,
    });
  } catch (err) {
    rethrowFetch(base, err);
  }
  await throwIfNotOk(res, path);
  const json = (await res.json()) as { data: T };
  return json.data;
}
