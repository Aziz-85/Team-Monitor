import { getScheduleGridForWeek } from './scheduleGrid';

export type RosterEmployee = { empId: string; name: string };
export type RosterWarnings = string[];

export interface RosterForDateResult {
  amEmployees: RosterEmployee[];
  pmEmployees: RosterEmployee[];
  offEmployees: RosterEmployee[];
  leaveEmployees: RosterEmployee[];
  warnings: RosterWarnings;
}

export type RosterForDateOptions = { boutiqueIds?: string[] };

/**
 * Roster for a date using the same shift resolution logic as the Schedule grid.
 * Single source of truth: **getScheduleGridForWeek** (availability, overrides, team parity, Friday PM-only).
 *
 * **Do not** reimplement shift/override resolution elsewhere for business rules — extend `scheduleGrid.ts` instead.
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
    if (cell.availability === 'WORK') {
      if (cell.effectiveShift === 'MORNING') amEmployees.push(emp);
      else if (cell.effectiveShift === 'EVENING') pmEmployees.push(emp);
      else offEmployees.push(emp);
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

  const warnings: RosterWarnings = [];
  const dayOfWeek = d.getUTCDay();
  const isFriday = dayOfWeek === 5;
  if (isFriday) {
    if (amEmployees.length > 0) {
      warnings.push(`Friday is PM-only; AM count (${amEmployees.length}) must be 0`);
    }
  } else {
    if (pmEmployees.length < 2) {
      warnings.push(`PM count (${pmEmployees.length}) is below minimum 2`);
    }
    if (amEmployees.length > pmEmployees.length) {
      warnings.push(`AM (${amEmployees.length}) > PM (${pmEmployees.length}) - PM must be ≥ AM`);
    }
  }

  return {
    amEmployees,
    pmEmployees,
    offEmployees,
    leaveEmployees,
    warnings,
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
  };
}
