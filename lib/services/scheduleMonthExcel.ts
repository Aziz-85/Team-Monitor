/**
 * Monthly Excel view: one source of truth using getScheduleGridForWeek and computeCountsFromGridRows.
 */

import { getScheduleGridForWeek } from './scheduleGrid';
import { FRIDAY_DAY_OF_WEEK } from './shift';
import { getWeekStartSaturday } from '@/lib/utils/week';

export type MonthDayRow = {
  date: string;
  dowLabel: string;
  isFriday: boolean;
  morningAssignees: string[];
  eveningAssignees: string[];
  rashidCoverage: Array<{ name: string; shift: 'AM' | 'PM' }>;
  amCount: number;
  pmCount: number;
  minAm: number;
  minPm: number;
  warnings: string[];
};

export type ScheduleMonthExcelResult = {
  month: string;
  days: Array<{ date: string; dowLabel: string; isFriday: boolean }>;
  dayRows: MonthDayRow[];
};

function getWeekStartForDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const start = getWeekStartSaturday(d);
  const y = start.getFullYear();
  const m = String(start.getMonth() + 1).padStart(2, '0');
  const day = String(start.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getDayIndexInWeek(dateStr: string): number {
  const d = new Date(dateStr + 'T00:00:00Z');
  const day = d.getUTCDay();
  return (day - 6 + 7) % 7;
}

function getDatesInMonth(month: string): string[] {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const last = new Date(Date.UTC(y, m, 0));
  const out: string[] = [];
  const d = new Date(first);
  while (d.getTime() <= last.getTime()) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/**
 * Build monthly Excel data: for each day in the month, resolve from the week grid
 * and compute assignees, counts, and warnings using the same logic as weekly grid.
 * options.empId: when set (e.g. EMPLOYEE view), only that employee's data is included per day.
 * options.boutiqueIds: when set, only employees in these boutiques are included.
 */
export async function getScheduleMonthExcel(
  month: string,
  options: { empId?: string; boutiqueIds?: string[] } = {}
): Promise<ScheduleMonthExcelResult> {
  const dateStrs = getDatesInMonth(month);
  const weekStarts = new Set<string>();
  for (const dateStr of dateStrs) {
    weekStarts.add(getWeekStartForDate(dateStr));
  }

  const gridOptions = options.empId
    ? { empId: options.empId, ...(options.boutiqueIds?.length ? { boutiqueIds: options.boutiqueIds } : {}) }
    : { ...(options.boutiqueIds?.length ? { boutiqueIds: options.boutiqueIds } : {}) };

  const gridsByWeek = new Map<string, Awaited<ReturnType<typeof getScheduleGridForWeek>>>();
  for (const weekStart of Array.from(weekStarts)) {
    const grid = await getScheduleGridForWeek(weekStart, gridOptions);
    gridsByWeek.set(weekStart, grid);
  }

  const dayRows: MonthDayRow[] = [];

  for (const dateStr of dateStrs) {
    const weekStart = getWeekStartForDate(dateStr);
    const dayIdx = getDayIndexInWeek(dateStr);
    const grid = gridsByWeek.get(weekStart);
    if (!grid) continue;

    const d = new Date(dateStr + 'T00:00:00Z');
    const dayOfWeek = d.getUTCDay();
    const isFriday = dayOfWeek === FRIDAY_DAY_OF_WEEK;
    const dayInfo = grid.days[dayIdx];
    const minAm = dayInfo?.minAm ?? 2;
    const effectiveMinPm = isFriday ? (dayInfo?.minPm ?? 0) : Math.max(dayInfo?.minPm ?? 0, 2);
    const minPm = dayInfo?.minPm ?? 0;

    const morningAssignees: string[] = [];
    const eveningAssignees: string[] = [];
    const rashidCoverage: Array<{ name: string; shift: 'AM' | 'PM' }> = [];

    for (const row of grid.rows) {
      const cell = row.cells[dayIdx];
      if (cell.availability !== 'WORK') continue;
      if (cell.effectiveShift === 'MORNING') morningAssignees.push(row.name);
      if (cell.effectiveShift === 'EVENING') eveningAssignees.push(row.name);
      if (cell.effectiveShift === 'COVER_RASHID_AM') rashidCoverage.push({ name: row.name, shift: 'AM' });
      if (cell.effectiveShift === 'COVER_RASHID_PM') rashidCoverage.push({ name: row.name, shift: 'PM' });
    }

    const counts = grid.counts[dayIdx] ?? { amCount: 0, pmCount: 0, rashidAmCount: 0, rashidPmCount: 0 };
    const amCount = counts.amCount;
    const pmCount = counts.pmCount;

    const warnings: string[] = [];
    if (amCount > pmCount) warnings.push('AM > PM');
    if (!isFriday && effectiveMinPm > 0 && pmCount < effectiveMinPm) warnings.push('PM < minPM');
    if (isFriday && amCount > 0) warnings.push('Friday must be PM only');

    dayRows.push({
      date: dateStr,
      dowLabel: '', // filled by API with locale if needed
      isFriday,
      morningAssignees,
      eveningAssignees,
      rashidCoverage,
      amCount,
      pmCount,
      minAm: dayInfo?.minAm ?? minAm,
      minPm,
      warnings,
    });
  }

  const days = dayRows.map((r) => ({
    date: r.date,
    dowLabel: r.dowLabel,
    isFriday: r.isFriday,
  }));

  return { month, days, dayRows };
}
