import type { Locale } from '@/lib/i18n';

/**
 * `ar-SA` may default to the Islamic calendar in some engines; weekday/month labels
 * for grid dates (YYYY-MM-DD) must follow the Gregorian wall calendar.
 */
export function intlLocaleForGregorianCalendar(locale: string): string {
  return locale === 'ar' ? 'ar-SA-u-ca-gregory' : 'en-GB';
}

/** Parse API/grid calendar day (YYYY-MM-DD prefix or ISO) at UTC noon for a stable weekday. */
export function dateFromCalendarDayString(dateStr: string): Date {
  const ymd = /^(\d{4}-\d{2}-\d{2})/.exec(String(dateStr).trim());
  const key = ymd?.[1] ?? '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
    return new Date(`${key}T12:00:00Z`);
  }
  return new Date(dateStr);
}

export type FormatDateOptions = Intl.DateTimeFormatOptions & {
  dateStyle?: 'short' | 'medium' | 'long' | 'full';
  timeStyle?: 'short' | 'medium' | 'long' | 'full';
};

/**
 * Format a date using the given locale (respects RTL and Arabic numerals when locale is ar).
 */
export function formatDate(
  locale: Locale,
  date: Date | string | number,
  opts: FormatDateOptions = {}
): string {
  const d = typeof date === 'object' && 'getTime' in date ? date : new Date(date);
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SA' : 'en-GB', {
    ...opts,
  }).format(d);
}

export type FormatNumberOptions = Intl.NumberFormatOptions & {
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
};

/**
 * Format a number using the given locale (Arabic numerals when locale is ar).
 */
export function formatNumber(
  locale: Locale,
  n: number,
  opts: FormatNumberOptions = {}
): string {
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-SA' : 'en-GB', opts).format(n);
}
