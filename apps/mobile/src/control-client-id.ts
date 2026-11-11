import * as SecureStore from 'expo-secure-store';

const STORAGE_KEY = 'controlClientId';
let memoryId: string | null = null;

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `mobile-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Stable id for this app install so control lease is per device. */
export async function getControlClientId(): Promise<string> {
  if (memoryId) return memoryId;
  try {
    const existing = (await SecureStore.getItemAsync(STORAGE_KEY))?.trim();
    if (existing) {
      memoryId = existing;
      return existing;
    }
    const id = newId();
    await SecureStore.setItemAsync(STORAGE_KEY, id);
    memoryId = id;
    return id;
  } catch {
    memoryId = newId();
    return memoryId;
  }
}

/** Sync accessor after the first await (falls back to a fresh id). */
export function peekControlClientId(): string {
  return memoryId ?? newId();
}
