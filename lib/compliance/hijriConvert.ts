/**
 * Hijri ↔ Gregorian date conversion.
 * Uses hijri-converter (Umm al-Qura calendar).
 * All calculations use Gregorian; Hijri is for display/input only.
 */

import { toGregorian, toHijri } from 'hijri-converter';

export type HijriDate = { year: number; month: number; day: number };
export type GregorianDate = { year: number; month: number; day: number };

/** Convert Hijri (year, month, day) to Gregorian. */
export function hijriToGregorian(hy: number, hm: number, hd: number): GregorianDate {
  const result = toGregorian(hy, hm, hd);
  return { year: result.gy, month: result.gm, day: result.gd };
}

/** Convert Gregorian to Hijri. */
export function gregorianToHijri(gy: number, gm: number, gd: number): HijriDate {
  const result = toHijri(gy, gm, gd);
  return { year: result.hy, month: result.hm, day: result.hd };
}

/** Parse Hijri string "YYYY-MM-DD" or "DD/MM/YYYY" to Gregorian ISO date string. */
export function parseHijriToGregorianIso(hijriStr: string): string | null {
  const trimmed = hijriStr.trim();
  if (!trimmed) return null;

  let hy: number;
  let hm: number;
  let hd: number;

  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(trimmed)) {
    const [y, m, d] = trimmed.split('-').map(Number);
    hy = y;
    hm = m;
    hd = d;
  } else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed)) {
    const [d, m, y] = trimmed.split('/').map(Number);
    hy = y;
    hm = m;
    hd = d;
  } else {
    return null;
  }

  if (hy < 1343 || hy > 1500 || hm < 1 || hm > 12 || hd < 1 || hd > 30) {
    return null;
  }

  try {
    const g = hijriToGregorian(hy, hm, hd);
    const mm = String(g.month).padStart(2, '0');
    const dd = String(g.day).padStart(2, '0');
    return `${g.year}-${mm}-${dd}`;
  } catch {
    return null;
  }
}

/** Format Gregorian date to Hijri string "YYYY-MM-DD" for display. */
export function formatGregorianToHijriStr(gregorianIso: string): string | null {
  const match = gregorianIso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const [, y, m, d] = match;
  const gy = Number(y);
  const gm = Number(m);
  const gd = Number(d);
  try {
    const h = gregorianToHijri(gy, gm, gd);
    const hm = String(h.month).padStart(2, '0');
    const hd = String(h.day).padStart(2, '0');
    return `${h.year}-${hm}-${hd}`;
  } catch {
    return null;
  }
}
