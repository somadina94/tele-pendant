import { useState } from 'react';
import type { Locale } from '@tele-pendant/shared';
import { translate } from '@tele-pendant/shared';
import { apiPatch } from './api';
import { pinLocale, readLocale } from './i18n';

export function LanguageSelect({
  onLocale,
}: {
  onLocale?: (locale: Locale) => void;
}) {
  const [locale, setLocale] = useState<Locale>(readLocale);
  const t = (key: string) => translate(locale, key);

  return (
    <label>
      {t('language')}
      <select
        aria-label={t('language')}
        value={locale}
        onChange={(event) => {
          const next: Locale = event.target.value === 'es' ? 'es' : 'en';
          pinLocale(next);
          setLocale(next);
          onLocale?.(next);
          const token = localStorage.getItem('accessToken');
          if (token) {
            void apiPatch('/auth/locale', { locale: next }).catch(
              () => undefined,
            );
          }
        }}
      >
        <option value="en">English</option>
        <option value="es">Español</option>
      </select>
    </label>
  );
}
