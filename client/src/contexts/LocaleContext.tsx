import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { type Locale } from 'date-fns';
import { enUS } from 'date-fns/locale/en-US';
import { is } from 'date-fns/locale/is';
import { da } from 'date-fns/locale/da';
import { sv } from 'date-fns/locale/sv';
import { nb } from 'date-fns/locale/nb';
import { de } from 'date-fns/locale/de';
import { fr } from 'date-fns/locale/fr';
import { es } from 'date-fns/locale/es';
import { pl } from 'date-fns/locale/pl';
import { useAuth } from './AuthContext';

const LOCALE_MAP: Record<string, Locale> = {
  'en': enUS,
  'en-US': enUS,
  'is': is,
  'da': da,
  'sv': sv,
  'nb': nb,
  'de': de,
  'fr': fr,
  'es': es,
  'pl': pl,
};

export const SUPPORTED_LOCALES = [
  { code: 'en', label: 'English' },
  { code: 'is', label: 'Íslenska' },
  { code: 'da', label: 'Dansk' },
  { code: 'sv', label: 'Svenska' },
  { code: 'nb', label: 'Norsk' },
  { code: 'de', label: 'Deutsch' },
  { code: 'fr', label: 'Français' },
  { code: 'es', label: 'Español' },
  { code: 'pl', label: 'Polski' },
];

function resolveLocale(code: string): Locale {
  return LOCALE_MAP[code] ?? LOCALE_MAP[code.split('-')[0]] ?? enUS;
}

interface LocaleContextType {
  locale: Locale;
  localeCode: string;
  formatHour: (hour: number) => string;
}

const LocaleContext = createContext<LocaleContextType | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const localeCode = user?.locale ?? 'en';

  const value = useMemo(() => {
    const locale = resolveLocale(localeCode);

    const hourFormatter = new Intl.DateTimeFormat(localeCode, {
      hour: 'numeric',
      minute: '2-digit',
    });

    const formatHour = (hour: number): string => {
      const date = new Date(2000, 0, 1, hour, 0);
      return hourFormatter.format(date);
    };

    return { locale, localeCode, formatHour };
  }, [localeCode]);

  return (
    <LocaleContext.Provider value={value}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) throw new Error('useLocale must be used within LocaleProvider');
  return context;
}
