import { AsyncLocalStorage } from 'node:async_hooks';

export type AuditRequestContext = {
  clientId: string | null;
};

/** Set for the lifetime of one HTTP request so every audit write can see the device. */
export const auditRequestContext = new AsyncLocalStorage<AuditRequestContext>();
