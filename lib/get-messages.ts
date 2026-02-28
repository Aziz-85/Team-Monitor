import type { Locale } from './i18n';

const messagesCache: Record<string, Record<string, unknown>> = {};

export async function getMessages(locale: Locale): Promise<Record<string, unknown>> {
  if (messagesCache[locale]) return messagesCache[locale];
  const mod = locale === 'ar' ? await import('@/messages/ar.json') : await import('@/messages/en.json');
  messagesCache[locale] = mod.default as Record<string, unknown>;
  return messagesCache[locale];
}
