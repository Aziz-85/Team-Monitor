'use client';

import { useCallback } from 'react';
import { useI18n } from '@/app/providers';
import { getNested } from '@/lib/i18n/getNested';

export function useT() {
  const { messages, locale, dir } = useI18n();
  const t = useCallback(
    (key: string): string => {
      const v = getNested(messages, key);
      return typeof v === 'string' ? v : key;
    },
    [messages]
  );
  const isRtl = locale === 'ar';
  return { t, locale, dir, isRtl };
}
