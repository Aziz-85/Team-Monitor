/**
 * Format dates in English, Gregorian calendar, Asia/Riyadh timezone.
 * Use for audit/login and any UI that must display dates in English Gregorian (not Hijri).
 */

const TIMEZONE = 'Asia/Riyadh';
const LOCALE = 'en-GB';

const formatter = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/**
 * Format a date (Date, ISO string, or timestamp) as "DD/MM/YYYY, HH:mm" in English Gregorian, Asia/Riyadh.
 */
export function formatDateTimeEn(input: Date | string | number): string {
  const date = typeof input === 'object' && input instanceof Date
    ? input
    : new Date(input);
  if (Number.isNaN(date.getTime())) return '—';
  return formatter.format(date);
}

/**
 * Format as "YYYY-MM-DD HH:mm" in English Gregorian, Asia/Riyadh (for consistency with API/export).
 */
export function formatDateTimeEnISO(input: Date | string | number): string {
  const date = typeof input === 'object' && input instanceof Date
    ? input
    : new Date(input);
  if (Number.isNaN(date.getTime())) return '—';
  const parts = new Intl.DateTimeFormat(LOCALE, {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const y = get('year');
  const m = get('month');
  const d = get('day');
  const h = get('hour');
  const min = get('minute');
  return `${y}-${m}-${d} ${h}:${min}`;
}
