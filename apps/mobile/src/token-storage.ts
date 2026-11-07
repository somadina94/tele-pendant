import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'accessToken';

/**
 * TP-49: JWT lives in the platform secure store (Keychain / Keystore),
 * not plaintext AsyncStorage. Migrates any legacy AsyncStorage token once.
 */
export async function getAccessToken(): Promise<string | null> {
  try {
    const secure = await SecureStore.getItemAsync(TOKEN_KEY);
    if (secure) return secure;
  } catch {
    /* SecureStore unavailable in some test hosts — fall through. */
  }

  const legacy = await AsyncStorage.getItem(TOKEN_KEY);
  if (!legacy) return null;

  try {
    await SecureStore.setItemAsync(TOKEN_KEY, legacy);
    await AsyncStorage.removeItem(TOKEN_KEY);
  } catch {
    /* Keep legacy readable until SecureStore works on this build. */
  }
  return legacy;
}

export async function setAccessToken(token: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    await AsyncStorage.removeItem(TOKEN_KEY);
    return;
  } catch {
    await AsyncStorage.setItem(TOKEN_KEY, token);
  }
}

export async function clearAccessToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    /* ignore */
  }
  await AsyncStorage.removeItem(TOKEN_KEY);
}
