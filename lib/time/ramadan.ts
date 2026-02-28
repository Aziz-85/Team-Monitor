/**
 * Ramadan date range: خلال الفترة الدوام كالمعتاد (صباحي + مساء)، مع إضافة دوام الفترة الصباحية ليوم الجمعة.
 * Uses env RAMADAN_START and RAMADAN_END (YYYY-MM-DD), or default 2026 period if not set.
 */

/** Default Ramadan period for 2026 (١٦ كانون الثاني – ٢١ آذار) when env not set. */
const DEFAULT_RAMADAN_2026 = { start: '2026-01-16', end: '2026-03-21' } as const;

function getRangeForCheck(): { start: string; end: string } {
  const start = process.env.RAMADAN_START;
  const end = process.env.RAMADAN_END;
  if (start && end && /^\d{4}-\d{2}-\d{2}$/.test(start) && /^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return { start, end };
  }
  return { ...DEFAULT_RAMADAN_2026 };
}

export function isRamadan(date: Date): boolean {
  const range = getRangeForCheck();
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  const startMs = new Date(range.start + 'T00:00:00Z').getTime();
  const endMs = new Date(range.end + 'T23:59:59.999Z').getTime();
  const t = d.getTime();
  return t >= startMs && t <= endMs;
}

/** Returns { start, end } from env or default 2026 range. (Server-only; use ramadanRange prop on client.) */
export function getRamadanRange(): { start: string; end: string } {
  return getRangeForCheck();
}

/** Pure check: is date inside range? Use on client when range is passed from server. */
export function isDateInRamadanRange(date: Date, range: { start: string; end: string }): boolean {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  const startMs = new Date(range.start + 'T00:00:00Z').getTime();
  const endMs = new Date(range.end + 'T23:59:59.999Z').getTime();
  const t = d.getTime();
  return t >= startMs && t <= endMs;
}
