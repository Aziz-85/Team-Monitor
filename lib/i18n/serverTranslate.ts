/**
 * Server-side translations without next-intl request config.
 * Uses cookie `dt_locale` + JSON messages (same as I18nProvider / useT).
 */

import { cookies } from 'next/headers';
import { getMessages } from '@/lib/get-messages';
import { getNested } from '@/lib/i18n/getNested';
import type { Locale } from '@/lib/i18n';

export async function getRequestLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  return cookieStore.get('dt_locale')?.value === 'ar' ? 'ar' : 'en';
}

/**
 * Namespace-prefixed translator, e.g. getServerTranslations('admin.importCenter') then t('historicalPageBanner').
 */
export async function getServerTranslations(
  namespace: string
): Promise<(key: string) => string> {
  const locale = await getRequestLocale();
  const messages = await getMessages(locale);
  const prefix = namespace ? `${namespace}.` : '';
  return (key: string) => {
    const v = getNested(messages, `${prefix}${key}`);
    return typeof v === 'string' ? v : String(key);
  };
}
