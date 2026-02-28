/**
 * SINGLE SOURCE OF TRUTH FOR SCHEDULE COMPUTATION
 * -----------------------------------------------
 * All effectiveShift, availability, and day counts (boutique AM/PM, Rashid coverage)
 * for the WEEK schedule are defined here. Views and APIs must consume getScheduleGridForWeek
 * or computeDayCountsFromCells / computeCountsFromGridRows — no duplicated counting logic.
 * - effectiveShift: from override or base (team/week parity; Friday = EVENING only).
 * - availability: WORK | LEAVE | OFF | ABSENT (from leaves, weeklyOffDay, inventoryAbsent).
 * - Counts: only availability === 'WORK' contributes; MORNING/EVENING = boutique; COVER_RASHID_* = Rashid only.
 */

import { prisma } from '@/lib/db';
import type { Team } from '@prisma/client';
import { isRamadan } from '@/lib/time/ramadan';
import { getWeekIndexInYear, FRIDAY_DAY_OF_WEEK } from './shift';
import type { ShiftType } from './shift';
import { getEmployeeTeamsForDateRange } from './employeeTeam';
import { buildEmployeeWhereForOperational, employeeOrderByStable } from '@/lib/employee/employeeQuery';

export type AvailabilityStatus = 'LEAVE' | 'OFF' | 'WORK' | 'ABSENT';

export type GridCell = {
  date: string;
  availability: AvailabilityStatus;
  effectiveShift: ShiftType;
  overrideId: string | null;
  baseShift: ShiftType;
};

export type GridRow = {
  empId: string;
  name: string;
  team: string;
  cells: GridCell[];
  /** Cross-boutique guest: shown only on dates with host-boutique override; home boutique code for badge */
  isGuest?: boolean;
  homeBoutiqueCode?: string;
};

export type GridDay = {
  date: string;
  dayName: string;
  dayOfWeek: number;
  minAm: number;
  minPm: number;
};

/** Boutique AM/PM and Rashid AM/PM per day. Only WORK cells count; coverage excluded from boutique. */
export type DayCounts = {
  amCount: number;
  pmCount: number;
  rashidAmCount: number;
  rashidPmCount: number;
};

/**
 * Deterministic count calculation: only cells with availability === 'WORK' contribute.
 * LEAVE/OFF/ABSENT never count even if an override exists.
 * Used by grid builder and by unit tests to prevent regression.
 */
export function computeDayCountsFromCells(
  cells: Array<{ availability: string; effectiveShift: string }>
): DayCounts {
  const counts: DayCounts = { amCount: 0, pmCount: 0, rashidAmCount: 0, rashidPmCount: 0 };
  for (const cell of cells) {
    if (cell.availability !== 'WORK') continue;
    const s = cell.effectiveShift as ShiftType;
    if (s === 'MORNING') counts.amCount++;
    else if (s === 'EVENING') counts.pmCount++;
    else if (s === 'COVER_RASHID_AM') counts.rashidAmCount++;
    else if (s === 'COVER_RASHID_PM') counts.rashidPmCount++;
  }
  return counts;
}

/**
 * Compute per-day counts from grid rows. Use this for draft counts in the editor so
 * the same rules apply (WORK only; MORNING/EVENING = boutique; COVER_RASHID_* = Rashid).
 * getEffectiveShift(empId, date, serverEffectiveShift) => effective shift for that cell (e.g. draft or server).
 */
export function computeCountsFromGridRows(
  rows: Array<{ empId: string; cells: Array<{ date: string; availability: string; effectiveShift: string }> }>,
  getEffectiveShift: (empId: string, date: string, serverShift: string) => string = (_e, _d, s) => s
): DayCounts[] {
  const dayCount = rows[0]?.cells.length ?? 0;
  const counts: DayCounts[] = Array.from({ length: dayCount }, () => ({
    amCount: 0,
    pmCount: 0,
    rashidAmCount: 0,
    rashidPmCount: 0,
  }));
  for (const row of rows) {
    for (let i = 0; i < row.cells.length; i++) {
      const cell = row.cells[i];
      const shift = getEffectiveShift(row.empId, cell.date, cell.effectiveShift);
      if (cell.availability !== 'WORK') continue;
      if (shift === 'MORNING') counts[i].amCount++;
      else if (shift === 'EVENING') counts[i].pmCount++;
      else if (shift === 'COVER_RASHID_AM') counts[i].rashidAmCount++;
      else if (shift === 'COVER_RASHID_PM') counts[i].rashidPmCount++;
    }
  }
  return counts;
}

export type ScheduleGridResult = {
  weekStart: string;
  days: GridDay[];
  rows: GridRow[];
  /** For each day index. Single source of truth: derived from same rows/cells as view. */
  counts: DayCounts[];
  /** Data integrity: e.g. "Friday AM present" when override data is invalid (read-only indicator). */
  integrityWarnings?: string[];
};

/**
 * Deterministic display order: Team A first, then Team B; within each team by name, then empId.
 * Shared by Schedule (View) and Schedule Editor so table structure and grouping match.
 */
export function sortRowsForDisplay(rows: GridRow[]): GridRow[] {
  return [...rows].sort((a, b) => {
    if (a.team !== b.team) return a.team === 'A' ? -1 : 1;
    const nameCmp = (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });
    if (nameCmp !== 0) return nameCmp;
    return (a.empId || '').localeCompare(b.empId || '');
  });
}

/** Saturday = start of week. weekStart must be YYYY-MM-DD of Saturday. */
export async function getScheduleGridForWeek(
  weekStart: string,
  options: { empId?: string; team?: string; boutiqueIds?: string[] } = {}
): Promise<ScheduleGridResult> {
  const start = new Date(weekStart + 'T00:00:00Z');
  const day = start.getUTCDay();
  const daysBack = (day - 6 + 7) % 7;
  start.setUTCDate(start.getUTCDate() - daysBack);
  const weekDates: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    weekDates.push(d);
  }
  const dateStrs = weekDates.map((d) => d.toISOString().slice(0, 10));
  const firstDate = weekDates[0];
  const lastDate = weekDates[6];

  const teamFilter: { team: Team } | undefined =
    options.team === 'A' || options.team === 'B' ? { team: options.team as Team } : undefined;
  const boutiqueIds = options.boutiqueIds ?? [];
  const baseWhere = buildEmployeeWhereForOperational(boutiqueIds, {
    excludeSystemOnly: true,
  });
  const empWhere = {
    ...baseWhere,
    ...(options.empId ? { empId: options.empId } : {}),
    ...teamFilter,
  };

  // Option 1: Base roster only (Employee.boutiqueId = host). Guest coverage shown separately per day via External Coverage.
  const employees = await prisma.employee.findMany({
    where: empWhere,
    select: { empId: true, name: true, team: true, weeklyOffDay: true },
    orderBy: employeeOrderByStable,
  });

  const overrides = await prisma.shiftOverride.findMany({
    where: {
      empId: { in: employees.map((e) => e.empId) },
      date: { gte: firstDate, lte: lastDate },
      isActive: true,
    },
    select: { id: true, empId: true, date: true, overrideShift: true },
  });

  // Guest shifts (other-boutique employees at host): used only for day counts, not roster rows
  const guestShiftCountsByDay = dateStrs.map(() => ({ am: 0, pm: 0 }));
  if (boutiqueIds.length > 0 && !options.empId) {
    const guestOverrides = await prisma.shiftOverride.findMany({
      where: {
        boutiqueId: { in: boutiqueIds },
        date: { gte: firstDate, lte: lastDate },
        isActive: true,
        overrideShift: { in: ['MORNING', 'EVENING'] },
        employee: {
          boutiqueId: { notIn: boutiqueIds },
          active: true,
        },
      },
      select: { date: true, overrideShift: true },
    });
    for (const o of guestOverrides) {
      const dateStr = o.date.toISOString().slice(0, 10);
      const i = dateStrs.indexOf(dateStr);
      if (i >= 0) {
        if (o.overrideShift === 'MORNING') guestShiftCountsByDay[i].am += 1;
        else if (o.overrideShift === 'EVENING') guestShiftCountsByDay[i].pm += 1;
      }
    }
  }

  const empIds = employees.map((e) => e.empId);

  if (empIds.length === 0) {
    const days: GridDay[] = dateStrs.map((date, i) => {
      const d = weekDates[i];
      const dayOfWeek = d.getUTCDay();
      const isFridayDay = dayOfWeek === FRIDAY_DAY_OF_WEEK;
      return {
        date,
        dayName: '',
        dayOfWeek,
        minAm: isFridayDay ? 0 : 2,
        minPm: isFridayDay ? 0 : 2,
      };
    });
    return {
      weekStart: dateStrs[0],
      days,
      rows: [],
      counts: days.map(() => ({ amCount: 0, pmCount: 0, rashidAmCount: 0, rashidPmCount: 0 })),
    };
  }

  const [leaves, absents, coverageRules] = await Promise.all([
    prisma.leave.findMany({
      where: {
        empId: { in: empIds },
        status: 'APPROVED',
        startDate: { lte: lastDate },
        endDate: { gte: firstDate },
      },
      select: { empId: true, startDate: true, endDate: true },
    }),
    prisma.inventoryAbsent
      ? prisma.inventoryAbsent.findMany({
          where: {
            empId: { in: empIds },
            date: { gte: firstDate, lte: lastDate },
          },
          select: { empId: true, date: true },
        })
      : Promise.resolve([]),
    prisma.coverageRule.findMany({
      where: { enabled: true },
      select: { dayOfWeek: true, minAM: true, minPM: true },
    }),
  ]);

  const overrideByKey = new Map<string, { id: string; overrideShift: string }>();
  for (const o of overrides) {
    const key = `${o.empId}_${o.date.toISOString().slice(0, 10)}`;
    overrideByKey.set(key, { id: o.id, overrideShift: o.overrideShift });
  }

  const leaveRangesByEmp = new Map<string, Array<{ start: Date; end: Date }>>();
  for (const l of leaves) {
    const list = leaveRangesByEmp.get(l.empId) ?? [];
    list.push({ start: l.startDate, end: l.endDate });
    leaveRangesByEmp.set(l.empId, list);
  }

  const absentSet = new Set(absents.map((a) => `${a.empId}_${a.date.toISOString().slice(0, 10)}`));
  const ruleByDay = new Map(coverageRules.map((r) => [r.dayOfWeek, r]));

  const teamByEmpAndDate = await getEmployeeTeamsForDateRange(empIds, firstDate, lastDate);

  const rows: GridRow[] = [];

  for (const emp of employees) {
    const empTeams = teamByEmpAndDate.get(emp.empId);
    const baseByDay: ShiftType[] = [];
    for (let i = 0; i < 7; i++) {
      const d = weekDates[i];
      const dateStr = dateStrs[i];
      const dayOfWeek = d.getUTCDay();
      const absentKey = `${emp.empId}_${dateStr}`;
      const isAbsent = absentSet.has(absentKey);
      const leaveRanges = leaveRangesByEmp.get(emp.empId) ?? [];
      const onLeave = leaveRanges.some((r) => {
        const dd = d.getTime();
        const start = new Date(r.start);
        start.setUTCHours(0, 0, 0, 0);
        const end = new Date(r.end);
        end.setUTCHours(23, 59, 59, 999);
        return dd >= start.getTime() && dd <= end.getTime();
      });
      const isOff = dayOfWeek === emp.weeklyOffDay;
      const availability: AvailabilityStatus = onLeave
        ? 'LEAVE'
        : isOff
          ? 'OFF'
          : isAbsent
            ? 'ABSENT'
            : 'WORK';

      const teamOnDay = empTeams?.get(dateStr) ?? emp.team;
      const weekIndexOnDay = getWeekIndexInYear(d);
      const isEvenWeekOnDay = weekIndexOnDay % 2 === 0;

      const baseShift: ShiftType =
        availability === 'WORK'
          ? dayOfWeek === FRIDAY_DAY_OF_WEEK
            ? 'EVENING'
            : teamOnDay === 'A'
              ? isEvenWeekOnDay
                ? 'MORNING'
                : 'EVENING'
              : isEvenWeekOnDay
                ? 'EVENING'
                : 'MORNING'
          : 'NONE';

      baseByDay.push(baseShift);
    }

    const cells: GridCell[] = dateStrs.map((dateStr, i) => {
      const d = weekDates[i];
      const dayOfWeek = d.getUTCDay();
      const override = overrideByKey.get(`${emp.empId}_${dateStr}`);
      const absentKey = `${emp.empId}_${dateStr}`;
      const isAbsent = absentSet.has(absentKey);
      const leaveRanges = leaveRangesByEmp.get(emp.empId) ?? [];
      const onLeave = leaveRanges.some((r) => {
        const dd = d.getTime();
        const start = new Date(r.start);
        start.setUTCHours(0, 0, 0, 0);
        const end = new Date(r.end);
        end.setUTCHours(23, 59, 59, 999);
        return dd >= start.getTime() && dd <= end.getTime();
      });
      const isOff = dayOfWeek === emp.weeklyOffDay;
      const availability: AvailabilityStatus = onLeave
        ? 'LEAVE'
        : isOff
          ? 'OFF'
          : isAbsent
            ? 'ABSENT'
            : 'WORK';

      const baseShift = baseByDay[i];
      const effectiveShift: ShiftType = override
        ? (override.overrideShift as ShiftType)
        : baseShift;

      return {
        date: dateStr,
        availability,
        effectiveShift,
        overrideId: override?.id ?? null,
        baseShift,
      };
    });

    const rowTeam = empTeams?.get(dateStrs[0]) ?? emp.team;
    rows.push({
      empId: emp.empId,
      name: emp.name,
      team: rowTeam,
      cells,
    });
  }

  let finalRows = sortRowsForDisplay(rows);
  if (options.team === 'A' || options.team === 'B') {
    finalRows = finalRows.filter((row) => row.team === options.team);
  }

  const counts = computeCountsFromGridRows(finalRows);
  for (let i = 0; i < counts.length; i++) {
    counts[i].amCount += guestShiftCountsByDay[i].am;
    counts[i].pmCount += guestShiftCountsByDay[i].pm;
  }

  const days: GridDay[] = dateStrs.map((dateStr, i) => {
    const d = weekDates[i];
    const dayOfWeek = d.getUTCDay();
    const rule = ruleByDay.get(dayOfWeek);
    const isFridayDay = dayOfWeek === FRIDAY_DAY_OF_WEEK;
    return {
      date: dateStr,
      dayName: '',
      dayOfWeek,
      minAm: isFridayDay ? 0 : (rule?.minAM ?? 2),
      minPm: isFridayDay ? (rule?.minPM ?? 0) : (rule ? Math.max(rule.minPM ?? 0, 2) : 2),
    };
  });

  const integrityWarnings: string[] = [];
  for (const row of finalRows) {
    for (const cell of row.cells) {
      if (cell.availability !== 'WORK') continue;
      const d = new Date(cell.date + 'T00:00:00Z');
      if (d.getUTCDay() === FRIDAY_DAY_OF_WEEK && (cell.effectiveShift === 'MORNING' || cell.effectiveShift === 'COVER_RASHID_AM') && !isRamadan(d)) {
        integrityWarnings.push(`Friday AM present: ${row.name} on ${cell.date}`);
      }
    }
  }

  return {
    weekStart: dateStrs[0],
    days,
    rows: finalRows,
    counts,
    integrityWarnings: integrityWarnings.length > 0 ? integrityWarnings : undefined,
  };
}
