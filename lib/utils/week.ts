export function getWeekStartSaturday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun..6=Sat (local)
  const diff = (day - 6 + 7) % 7;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Week start as YYYY-MM-DD (Saturday). Uses same Saturday logic as getWeekStartSaturday. */
export function getWeekStart(date: Date): string {
  const start = getWeekStartSaturday(date);
  const y = start.getFullYear();
  const m = String(start.getMonth() + 1).padStart(2, '0');
  const day = String(start.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 1-based week number in year (Saturday-based week). Uses same Saturday logic as getWeekStartSaturday. */
export function getWeekNumber(date: Date): number {
  const start = getWeekStartSaturday(date);
  const startOfYear = new Date(start.getFullYear(), 0, 1);
  const startDay = startOfYear.getDay();
  const firstSaturdayOffset = (6 - startDay + 7) % 7;
  const firstSat = new Date(start.getFullYear(), 0, 1 + firstSaturdayOffset);
  const diff = start.getTime() - firstSat.getTime();
  if (diff < 0) return 1;
  return Math.floor(diff / (7 * 24 * 60 * 60 * 1000)) + 1;
}

export function getWeekEndFriday(date: Date): Date {
  const start = getWeekStartSaturday(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

export function addWeeks(date: Date, delta: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + delta * 7);
  return d;
}

