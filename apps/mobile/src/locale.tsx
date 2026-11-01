import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { translate, translateError, type Locale } from '@tele-pendant/shared';
import { pinLocale, readLocale } from './i18n';

const LocaleContext = createContext<{
  locale: Locale;
  t: (key: string) => string;
  terror: (message: string) => string;
  setLocale: (locale: Locale) => void;
}>({
  locale: 'en',
  t: (key) => translate('en', key),
  terror: (message) => translateError('en', message),
  setLocale: () => undefined,
});

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en');
  useEffect(() => {
    void readLocale().then(setLocaleState);
  }, []);
  const value = useMemo(
    () => ({
      locale,
      t: (key: string) => translate(locale, key),
      terror: (message: string) => translateError(locale, message),
      setLocale: (next: Locale) => {
        setLocaleState(next);
        void pinLocale(next);
      },
    }),
    [locale],
  );
  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useLocale() {
  return useContext(LocaleContext);
}
