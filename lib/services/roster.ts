import { getScheduleGridForWeek } from './scheduleGrid';
import { shiftAmPmContribution } from '@/lib/schedule/segmentCoverage';
import { evaluateCoverage } from '@/lib/schedule/coveragePolicy';
import type { SlotViolation } from '@/lib/schedule/generateSchedule/types';

export type RosterEmployee = { empId: string; name: string };
export type RosterWarnings = string[];

export interface RosterForDateResult {
  amEmployees: RosterEmployee[];
  pmEmployees: RosterEmployee[];
  offEmployees: RosterEmployee[];
  leaveEmployees: RosterEmployee[];
  warnings: RosterWarnings;
  /** Engine slot validation for this date (read from grid.timeCoverage — never recomputed here). */
  slotViolations?: SlotViolation[];
}

export type RosterForDateOptions = { boutiqueIds?: string[] };

/**
 * Roster for a date read from the Schedule Engine grid output.
 * Single source of truth: **getScheduleGridForWeek** (availability, overrides, segments, slot coverage).
 * AM/PM membership is the engine's segment projection (shiftAmPmContribution) — not a shift-enum switch.
 *
 * **Do not** reimplement shift/override/coverage resolution elsewhere — extend the engine instead.
 */
export async function rosterForDate(
  date: Date,
  options: RosterForDateOptions = {}
): Promise<RosterForDateResult> {
  const d = toDateOnly(date);
  const dateStr = d.toISOString().slice(0, 10);
  const boutiqueIds = options.boutiqueIds ?? [];

  const grid = await getScheduleGridForWeek(dateStr, { boutiqueIds });
  const dayIndex = grid.days.findIndex((day) => day.date === dateStr);
  if (dayIndex < 0) {
    return emptyRoster();
  }

  const ctx = grid.dayCountContexts[dayIndex];
  const amEmployees: RosterEmployee[] = [];
  const pmEmployees: RosterEmployee[] = [];
  const offEmployees: RosterEmployee[] = [];
  const leaveEmployees: RosterEmployee[] = [];

  for (const row of grid.rows) {
    const cell = row.cells[dayIndex];
    if (!cell) continue;

    const emp = { empId: row.empId, name: row.name };

    if (cell.availability === 'LEAVE') {
      leaveEmployees.push(emp);
      continue;
    }
    if (cell.availability === 'OFF' || cell.availability === 'HOLIDAY' || cell.availability === 'ABSENT') {
      offEmployees.push(emp);
      continue;
    }
    if (cell.availability === 'WORK' && ctx) {
      const { am, pm } = shiftAmPmContribution(
        cell.effectiveShift,
        ctx.operatingPeriods,
        ctx.dayOfWeek,
        ctx.isRamadan,
        ctx.maxDailyHours,
        cell.segments
      );
      if (am) amEmployees.push(emp);
      if (pm) pmEmployees.push(emp);
      if (!am && !pm) offEmployees.push(emp);
    } else {
      offEmployees.push(emp);
    }
  }

  if (process.env.DEBUG_SCHEDULE_SUGGESTIONS === '1') {
    // eslint-disable-next-line no-console
    console.log('[roster.rosterForDate]', {
      date: dateStr,
      boutiqueIds,
      amCount: amEmployees.length,
      pmCount: pmEmployees.length,
      amEmpIds: amEmployees.map((e) => e.empId),
      pmEmpIds: pmEmployees.map((e) => e.empId),
    });
  }

  const day = grid.days[dayIndex];
  const warnings: RosterWarnings = evaluateCoverage(
    { am: amEmployees.length, pm: pmEmployees.length },
    day.dayOfWeek,
    day.minAm ?? 0,
    day.minPm ?? 0
  ).map((i) => i.message);

  const slotViolations = grid.timeCoverage.violations.filter((v) => v.date === dateStr);

  return {
    amEmployees,
    pmEmployees,
    offEmployees,
    leaveEmployees,
    warnings,
    slotViolations,
  };
}

function toDateOnly(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function emptyRoster(): RosterForDateResult {
  return {
    amEmployees: [],
    pmEmployees: [],
    offEmployees: [],
    leaveEmployees: [],
    warnings: [],
    slotViolations: [],
  };
}
