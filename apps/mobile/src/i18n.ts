import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  resolveLocale,
  translate,
  translateError,
  type Locale,
} from '@tele-pendant/shared';

export function deviceLocale(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || 'en';
  } catch {
    return 'en';
  }
}

export async function readLocale(): Promise<Locale> {
  const pinned = (await AsyncStorage.getItem('localePinned')) === '1';
  const saved = await AsyncStorage.getItem('localeOverride');
  return resolveLocale({ pinned, saved, device: deviceLocale() });
}

export async function pinLocale(locale: Locale): Promise<void> {
  await AsyncStorage.setItem('localePinned', '1');
  await AsyncStorage.setItem('localeOverride', locale);
}

export function t(locale: Locale, key: string): string {
  return translate(locale, key);
}

export function terror(locale: Locale, message: string): string {
  return translateError(locale, message);
}
