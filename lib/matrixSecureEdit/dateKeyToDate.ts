import { ymdToUTCNoon, type YMD } from '@/lib/dates/safeCalendar';

export function dateKeyToUTCNoon(dateKey: string): Date {
  const parts = dateKey.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
    throw new Error(`Invalid dateKey: ${dateKey}`);
  }
  const ymd: YMD = { y: parts[0]!, m: parts[1]!, d: parts[2]! };
  return ymdToUTCNoon(ymd);
}
