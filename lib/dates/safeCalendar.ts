/**
 * Safe calendar day key helpers. Calendar day (not moment). Avoid ISO slicing which can shift days.
 */

export function dateKeyUTC(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function monthKeyUTC(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function monthRangeUTCNoon(month: string): { start: Date; endExclusive: Date } {
  const [y, m] = month.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1, 12, 0, 0));
  const endExclusive = new Date(Date.UTC(y, m, 1, 12, 0, 0));
  return { start, endExclusive };
}

export function monthDaysUTC(month: string): string[] {
  const { start, endExclusive } = monthRangeUTCNoon(month);
  const out: string[] = [];
  for (let t = start.getTime(); t < endExclusive.getTime(); t += 86400000) {
    out.push(dateKeyUTC(new Date(t)));
  }
  return out;
}

export type YMD = { y: number; m: number; d: number };

export function parseExcelDateToYMD(input: unknown): YMD {
  if (typeof input === 'string') {
    const s = input.trim();
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (iso) return { y: +iso[1], m: +iso[2], d: +iso[3] };

    const dmy = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/.exec(s);
    if (dmy) return { y: +dmy[3], m: +dmy[2], d: +dmy[1] };

    throw new Error(`Unsupported date string: "${s}"`);
  }

  if (input instanceof Date && !Number.isNaN(input.getTime())) {
    return { y: input.getUTCFullYear(), m: input.getUTCMonth() + 1, d: input.getUTCDate() };
  }

  if (typeof input === 'number' && Number.isFinite(input)) {
    const utcMs = (input - 25569) * 86400000;
    const dt = new Date(utcMs);
    return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
  }

  throw new Error(`Unsupported Excel date type: ${Object.prototype.toString.call(input)}`);
}

export function ymdToUTCNoon(ymd: YMD): Date {
  return new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d, 12, 0, 0));
}
