import Constants from 'expo-constants';
import { notifyUnauthorized } from './session';
import { clearAccessToken } from './token-storage';

const LIVE_API = 'https://api.tele-pendant.jahbyte.com/api/v1';

/** API base from env (`EXPO_PUBLIC_API_URL` or `APP_URL` + `/api/v1`), else live. */
export function getApiBase(): string {
  const fromExtra = Constants.expoConfig?.extra?.apiUrl;
  if (typeof fromExtra === 'string' && fromExtra.trim()) {
    return fromExtra.trim().replace(/\/$/, '');
  }
  const fromEnv = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  return LIVE_API;
}

function isAuthBootstrapPath(path: string): boolean {
  return (
    path === '/auth/login' ||
    path === '/auth/login/otp' ||
    path === '/auth/login/otp/resend' ||
    path === '/auth/face/login'
  );
}

async function apiSend<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
  token?: string | null,
): Promise<T> {
  const base = getApiBase();
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    // Live tags must not reuse a conditional/304 cache entry (prod jump).
    cache: 'no-store',
  });
  if (!res.ok) {
    if (res.status === 401 && !isAuthBootstrapPath(path)) {
      await clearAccessToken();
      notifyUnauthorized();
    }
    const text = await res.text();
    let message = text;
    try {
      const parsed = JSON.parse(text) as { message?: string | string[] };
      if (typeof parsed.message === 'string') message = parsed.message;
      else if (Array.isArray(parsed.message))
        message = parsed.message.join(', ');
    } catch {
      message = text;
    }
    throw new Error(message || `Request failed (${res.status})`);
  }
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
