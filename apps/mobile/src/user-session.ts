import AsyncStorage from '@react-native-async-storage/async-storage';
import type { UserRole } from '@tele-pendant/shared';
import { isUserRole } from '@tele-pendant/shared';

export type StoredUser = {
  id: string;
  email: string;
  role: string;
  displayName: string | null;
  locale: string;
  twoFactorEnabled?: boolean;
  hasSafeActionPin?: boolean;
};

const USER_KEY = 'user';

export async function persistUser(user: StoredUser): Promise<void> {
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
}

export async function getStoredUser(): Promise<StoredUser | null> {
  try {
    const raw = await AsyncStorage.getItem(USER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredUser;
  } catch {
    return null;
  }
}

export async function getStoredUserRole(): Promise<UserRole | null> {
  const role = (await getStoredUser())?.role;
  return isUserRole(role) ? role : null;
}

export async function clearStoredUser(): Promise<void> {
  await AsyncStorage.removeItem(USER_KEY);
}
