'use client';

import { createContext, useContext, useCallback, useState, useMemo } from 'react';
import type { Locale } from '@/lib/i18n';
import { getDir } from '@/lib/i18n';

type Messages = Record<string, unknown>;

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  messages: Messages;
  dir: 'ltr' | 'rtl';
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}

export function I18nProvider({
  initialLocale,
  initialMessages,
  children,
}: {
  initialLocale: Locale;
  initialMessages: Messages;
  children: React.ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const [messages, setMessages] = useState<Messages>(initialMessages);

  const setLocale = useCallback(async (newLocale: Locale) => {
    setLocaleState(newLocale);
    if (typeof document !== 'undefined') {
      document.documentElement.lang = newLocale;
      document.documentElement.dir = newLocale === 'ar' ? 'rtl' : 'ltr';
    }
    const res = await fetch(`/api/locale?locale=${newLocale}`, { method: 'POST' });
    if (res.ok) {
      const mod = await import(`@/messages/${newLocale}.json`);
      setMessages(mod.default as Messages);
    }
  }, []);

  const dir = getDir(locale);
  const value = useMemo(
    () => ({ locale, setLocale, messages, dir }),
    [locale, setLocale, messages, dir]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
