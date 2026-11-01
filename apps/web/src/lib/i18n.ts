import {
  resolveLocale,
  translate,
  translateError,
  type Locale,
} from '@tele-pendant/shared';

export function readLocale(): Locale {
  let pinned = false;
  let saved: string | null = null;
  try {
    pinned = localStorage.getItem('localePinned') === '1';
    saved = localStorage.getItem('localeOverride');
    if (!saved) {
      const raw = localStorage.getItem('user');
      if (raw) {
        const user = JSON.parse(raw) as { locale?: string };
        saved = user.locale ?? null;
      }
    }
  } catch {
    pinned = false;
    saved = null;
  }
  const device =
    typeof navigator === 'undefined' ? 'en' : navigator.language;
  return resolveLocale({ pinned, saved, device });
}

export function pinLocale(locale: Locale): void {
  localStorage.setItem('localePinned', '1');
  localStorage.setItem('localeOverride', locale);
  const raw = localStorage.getItem('user');
  if (!raw) return;
  try {
    const user = JSON.parse(raw) as { locale?: string };
    user.locale = locale;
    localStorage.setItem('user', JSON.stringify(user));
  } catch {
    localStorage.removeItem('user');
  }
}

export function useT() {
  const locale = readLocale();
  return {
    locale,
    t: (key: string) => translate(locale, key),
    terror: (message: string) => translateError(locale, message),
  };
}
