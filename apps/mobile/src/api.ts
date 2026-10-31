import AsyncStorage from '@react-native-async-storage/async-storage';

const DEFAULT_API = 'http://127.0.0.1:3010/api/v1';

export async function getApiBase(): Promise<string> {
  return (await AsyncStorage.getItem('apiBase')) || DEFAULT_API;
}

async function apiSend<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
  token?: string | null,
): Promise<T> {
  const base = await getApiBase();
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
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
