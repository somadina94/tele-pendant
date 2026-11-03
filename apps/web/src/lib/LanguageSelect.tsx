import { useState } from 'react';
import { translate, type Locale } from '@tele-pendant/shared';
import { apiPatch } from './api';
import { pinLocale, readLocale } from './i18n';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

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
        onChange={(event) => change(event.target.value === 'es' ? 'es' : 'en')}
      >
        <option value="en">English</option>
        <option value="es">Español</option>
      </select>
    </div>
  );
}
