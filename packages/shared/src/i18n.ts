import de from '../i18n/de.json';
import en from '../i18n/en.json';
import es from '../i18n/es.json';
import fr from '../i18n/fr.json';

export type Locale = 'en' | 'es' | 'fr' | 'de';

export const LOCALES: Locale[] = ['en', 'es', 'fr', 'de'];

const catalogs: Record<Locale, Record<string, string>> = { en, es, fr, de };

export function normalizeLocale(raw: string | null | undefined): Locale | null {
  if (!raw) return null;
  const base = raw.toLowerCase().replace('_', '-').split('-')[0];
  if (base === 'es') return 'es';
  if (base === 'fr') return 'fr';
  if (base === 'de') return 'de';
  if (base === 'en') return 'en';
  return null;
}

/** Saved locale wins only after the operator pins it. Otherwise the device language wins. */
export function resolveLocale(options: {
  pinned: boolean;
  saved?: string | null;
  device?: string | null;
}): Locale {
  if (options.pinned) {
    return (
      normalizeLocale(options.saved) ?? normalizeLocale(options.device) ?? 'en'
    );
  }
  return (
    normalizeLocale(options.device) ?? normalizeLocale(options.saved) ?? 'en'
  );
}

export function translate(locale: Locale, key: string): string {
  return catalogs[locale][key] ?? catalogs.en[key] ?? key;
}

const errorKeys: Record<string, string> = {
  'Motion blocked: hold deadman and ensure normal safety mode': 'err.motion',
  'SAFE_ACTION_PIN does not match. Type the value from .env (this demo uses the admin password), not the name SAFE_ACTION_PIN.':
    'err.pin',
  'Face match failed — use password login': 'err.face',
  'No face detected': 'err.noface',
};

export function translateError(locale: Locale, message: string): string {
  const key = errorKeys[message];
  if (!key) return message;
  return translate(locale, key);
}
