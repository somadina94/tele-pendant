const API_BASE = '/api/v1';

export type ApiEnvelope<T> = { apiVersion: string; data: T };

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('accessToken');
  return token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await res.text());
  const body = (await res.json()) as ApiEnvelope<T>;
  return body.data;
}

export async function apiPost<T>(path: string, payload?: unknown): Promise<T> {
  return apiSend<T>('POST', path, payload);
}

export async function apiPut<T>(path: string, payload?: unknown): Promise<T> {
  return apiSend<T>('PUT', path, payload);
}

export async function apiPatch<T>(path: string, payload?: unknown): Promise<T> {
  return apiSend<T>('PATCH', path, payload);
}

export async function apiDelete<T>(path: string): Promise<T> {
  return apiSend<T>('DELETE', path);
}

async function apiSend<T>(
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  payload?: unknown,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: authHeaders(),
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  const body = (await res.json()) as ApiEnvelope<T>;
  return body.data;
}

export interface PublicUser {
  id: string;
  email: string;
  role: string;
  displayName: string | null;
  locale: string;
}

export interface RegisterRef {
  id: string;
  name: string;
  address: number;
  kind: string;
  trended?: boolean;
  nodeId?: string | null;
}

export interface CellDto {
  id: string;
  row: number;
  col: number;
  label: string;
  style: string;
  isMotion: boolean;
  requiresSafeAction: boolean;
  primaryRegister?: RegisterRef | null;
  feedbackRegister?: RegisterRef | null;
  statusRegister?: RegisterRef | null;
}

export interface OverlayDto {
  id: string;
  label: string;
  xPct: number;
  yPct: number;
  format: string;
  register?: RegisterRef | null;
}

export interface HmiLayout {
  matrix: { rows: number; cols: number };
  cells: CellDto[];
  background: {
    id: string;
    name: string;
    cssBackground?: string | null;
    imageUrl?: string | null;
  } | null;
  overlays: OverlayDto[];
  registers: RegisterRef[];
  safety: {
    mode: string;
    deadmanActive: boolean;
    eStopActive: boolean;
    watchdogOk: boolean;
  };
}

export interface LiveTags {
  hoistHeightMm: number;
  loadKg: number;
  speedPct: number;
  motorRunning: boolean;
  fault: boolean;
  commsOk: boolean;
  values?: Record<string, number | boolean>;
  at: string;
}
