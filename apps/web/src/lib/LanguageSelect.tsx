import { useState } from 'react';
import { LOCALES, translate, type Locale } from '@tele-pendant/shared';
import { apiPatch } from './api';
import { pinLocale, readLocale } from './i18n';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

const LABELS: Record<Locale, string> = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
};

export function LanguageSelect({
  onLocale,
}: {
  onLocale?: (locale: Locale) => void;
} = {}) {
  const [locale, setLocale] = useState<Locale>(readLocale);
  const t = (key: string) => translate(locale, key);

  function change(next: Locale) {
    pinLocale(next);
    setLocale(next);
    onLocale?.(next);
    const token = localStorage.getItem('accessToken');
    if (!token) return;
    void apiPatch('/auth/locale', { locale: next }).catch(() => undefined);
  }

  return (
    <div className="grid max-w-xs gap-2">
      <Label htmlFor="language">{t('language')}</Label>
      <select
        id="language"
        aria-label={t('language')}
        className={cn(
          'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
        value={locale}
        onChange={(event) => {
          const next = event.target.value as Locale;
          if (LOCALES.includes(next)) change(next);
        }}
      >
        {LOCALES.map((code) => (
          <option key={code} value={code}>
            {LABELS[code]}
          </option>
        ))}
      </select>
    </div>
  );
}
