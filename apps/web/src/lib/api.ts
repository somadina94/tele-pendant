import { clearSession, isPublicAuthPath, redirectToLogin } from './session';

const API_BASE = '/api/v1';

export type ApiEnvelope<T> = { apiVersion: string; data: T };

function authHeaders(json = true): HeadersInit {
  const token = localStorage.getItem('accessToken');
  const headers: HeadersInit = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (json) headers['Content-Type'] = 'application/json';
  return headers;
}

function isAuthBootstrapPath(path: string): boolean {
  return (
    path === '/auth/login' ||
    path === '/auth/login/otp' ||
    path === '/auth/login/otp/resend' ||
    path === '/auth/face/login' ||
    path.startsWith('/auth/face/login?')
  );
}

async function readErrorMessage(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const parsed = JSON.parse(text) as { message?: string | string[] };
    if (typeof parsed.message === 'string') return parsed.message;
    if (Array.isArray(parsed.message)) return parsed.message.join(', ');
  } catch {
    /* keep raw text */
  }
  return text || `Request failed (${res.status})`;
}

async function handleFailedResponse(
  res: Response,
  path: string,
): Promise<never> {
  if (res.status === 401 && !isAuthBootstrapPath(path)) {
    if (isPublicAuthPath()) clearSession();
    else redirectToLogin();
  }
  throw new Error(await readErrorMessage(res));
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { headers: authHeaders() });
  if (!res.ok) await handleFailedResponse(res, path);
  const body = (await res.json()) as ApiEnvelope<T>;
  return body.data;
}

/** GET a non-JSON response (e.g. CSV export) and trigger a browser download. */
export async function apiDownload(
  path: string,
  filename: string,
): Promise<void> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: authHeaders(false),
  });
  if (!res.ok) await handleFailedResponse(res, path);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
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

/** Multipart upload (do not set Content-Type — browser sets boundary). */
export async function apiUpload<T>(path: string, file: File): Promise<T> {
  const body = new FormData();
  body.append('file', file);
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: authHeaders(false),
    body,
  });
  if (!res.ok) await handleFailedResponse(res, path);
  const json = (await res.json()) as ApiEnvelope<T>;
  return json.data;
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
  if (!res.ok) await handleFailedResponse(res, path);
  const body = (await res.json()) as ApiEnvelope<T>;
  return body.data;
}

export interface PublicUser {
  id: string;
  email: string;
  role: string;
  displayName: string | null;
  locale: string;
  localePinned?: boolean;
  hasFaceTemplate?: boolean;
  hasSafeActionPin?: boolean;
  twoFactorEnabled?: boolean;
  suspended?: boolean;
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
  /** FEAT-A2 */
  variableSpeed?: boolean;
  slowSpeedPct?: number;
  fastSpeedPct?: number;
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

export interface HmiBackgroundSummary {
  id: string;
  name: string;
  active: boolean;
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
  /** FEAT-HMI phase 2: plant screens for Operator switcher. */
  backgrounds?: HmiBackgroundSummary[];
  overlays: OverlayDto[];
  registers: RegisterRef[];
  safety: {
    mode: string;
    deadmanActive: boolean;
    eStopActive: boolean;
    watchdogOk: boolean;
    control?: ControlLease;
  };
}

/** FEAT-A5 exclusive Operator control lease. */
export interface ControlLease {
  held: boolean;
  holderUserId: string | null;
  holderDisplayName: string | null;
  youHold: boolean;
  expiresAt: string | null;
}

export interface LiveTags {
  hoistHeightMm: number;
  loadKg: number;
  speedPct: number;
  trolleyPositionMm?: number;
  motorRunning: boolean;
  fault: boolean;
  commsOk: boolean;
  values?: Record<string, number | boolean>;
  at: string;
}
