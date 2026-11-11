import type { Request } from 'express';

/** Header sent by Operator web/mobile so the lease binds to one tab/device. */
export const CONTROL_CLIENT_ID_HEADER = 'x-control-client-id';

export function readControlClientId(req: Request): string {
  const raw = req.headers[CONTROL_CLIENT_ID_HEADER];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' ? value.trim() : '';
}
