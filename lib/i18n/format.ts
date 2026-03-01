import type { Locale } from '@/lib/i18n';

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
