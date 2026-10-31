import AsyncStorage from '@react-native-async-storage/async-storage';

const DEFAULT_API = 'http://127.0.0.1:3010/api/v1';

export async function getApiBase(): Promise<string> {
  return (await AsyncStorage.getItem('apiBase')) || DEFAULT_API;
}

export async function apiPost<T>(
  path: string,
  body?: unknown,
  token?: string | null,
): Promise<T> {
  const base = await getApiBase();
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  const json = (await res.json()) as { data: T };
  return json.data;
}

export async function apiGet<T>(path: string, token: string): Promise<T> {
  const base = await getApiBase();
  const res = await fetch(`${base}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(await res.text());
  const json = (await res.json()) as { data: T };
  return json.data;
}
