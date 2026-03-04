/**
 * Shared Excel date → dateKey (YYYY-MM-DD, Asia/Riyadh) parsing.
 * Server-only. Use for all import paths to avoid day -1 / first-day-missing and timezone drift.
 */

import { toRiyadhDateString, toRiyadhDayKey } from '@/lib/time';

/** Excel serial epoch: 25569 = 1970-01-01 00:00 UTC (days since 1899-12-30). */
const EXCEL_EPOCH_OFFSET = 25569;
const MS_PER_DAY = 86400 * 1000;

/**
 * Parse any Excel date value to YYYY-MM-DD in Asia/Riyadh (date-only, no timezone shift).
 * Use for every import path that reads Date from Excel so day 1 is never missing.
 *
 * @param raw - Cell value: number (Excel serial), Date (from xlsx), or string (YYYY-MM-DD, DD/MM/YYYY).
 * @param monthHint - Optional "YYYY-MM"; if provided, result is validated to be in that month (or previous for spillover). Omit to allow any month.
 */
export function parseExcelDateToDateKey(raw: unknown, monthHint?: string): string | null {
  if (raw == null || raw === '') return null;

  let dateKey: string | null = null;

  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw < 0) return null;
    const utcMs = (raw - EXCEL_EPOCH_OFFSET) * MS_PER_DAY;
    const d = new Date(utcMs);
    if (Number.isNaN(d.getTime())) return null;
    dateKey = toRiyadhDateString(d);
  } else if (raw instanceof Date) {
    if (!Number.isFinite((raw as Date).getTime())) return null;
    dateKey = toRiyadhDateString(raw as Date);
  } else if (typeof raw === 'string') {
    const s = String(raw).trim();
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      dateKey = s;
    } else {
      const ddmmyyyy = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/.exec(s);
      if (ddmmyyyy) {
        const [, d, m, y] = ddmmyyyy;
        const day = parseInt(d!, 10);
        const month = parseInt(m!, 10);
        const year = parseInt(y!, 10);
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
          const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
          dateKey = toRiyadhDateString(date);
        }
      }
      if (!dateKey) {
        const parsed = new Date(s.includes('T') ? s : s + 'T12:00:00.000Z');
        if (!Number.isNaN(parsed.getTime())) dateKey = toRiyadhDayKey(parsed);
      }
    }
  }

  if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;

  if (monthHint && /^\d{4}-\d{2}$/.test(monthHint)) {
    const resultMonth = dateKey.slice(0, 7);
    if (resultMonth !== monthHint) {
      const [y, m] = monthHint.split('-').map(Number);
      const prevMonth = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
      if (resultMonth !== prevMonth) return null;
    }
  }

  return dateKey;
}
