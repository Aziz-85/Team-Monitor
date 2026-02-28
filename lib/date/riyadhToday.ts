/**
 * Today's date (YYYY-MM-DD) in Asia/Riyadh. RTL/LTR safe.
 * Use for date filtering and "today" keys to avoid UTC day shift.
 */

const RIYADH = 'Asia/Riyadh';

/**
 * Returns current date in Asia/Riyadh as YYYY-MM-DD.
 */
export function getTodayRiyadh(): string {
  const s = new Date().toLocaleDateString('en-CA', { timeZone: RIYADH });
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const fallback = new Date();
  const y = fallback.getFullYear();
  const m = String(fallback.getMonth() + 1).padStart(2, '0');
  const d = String(fallback.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * From a YYYY-MM-DD string (e.g. Riyadh today), return { year, month, day, monthKey, daysPassed, totalDays }.
 */
export function parseRiyadhDateKey(dateKey: string): {
  year: number;
  month: number;
  day: number;
  monthKey: string;
  totalDays: number;
  daysPassed: number;
} | null {
  const m = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const day = parseInt(m[3], 10);
  const totalDays = new Date(year, month, 0).getDate();
  const daysPassed = Math.min(Math.max(1, day), totalDays);
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;
  return { year, month, day, monthKey, totalDays, daysPassed };
}
