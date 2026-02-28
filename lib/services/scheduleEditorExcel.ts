/**
 * Shared utilities for Schedule Editor Excel View.
 * Single source of truth: effective state -> day counts -> excel slot layout.
 */

import { computeCountsFromGridRows } from './scheduleGrid';
import type { DayCounts } from './scheduleGrid';

export type EffectiveCell = { date: string; availability: string; effectiveShift: string };
export type EffectiveRow = { empId: string; name: string; team: string; cells: EffectiveCell[] };

const FRIDAY_DAY_OF_WEEK = 5;

export function editKey(empId: string, date: string): string {
  return `${empId}|${date}`;
}

/**
 * Build effective schedule state: server rows with pending overrides applied.
 * Pending map: key = editKey(empId, date), value = newShift.
 */
export function buildEffectiveScheduleState(
  serverRows: Array<{ empId: string; name: string; team: string; cells: Array<{ date: string; availability: string; effectiveShift: string }> }>,
  pendingEdits: Map<string, { newShift: string }>
): EffectiveRow[] {
  return serverRows.map((row) => ({
    empId: row.empId,
    name: row.name,
    team: row.team,
    cells: row.cells.map((cell) => {
      const key = editKey(row.empId, cell.date);
      const edit = pendingEdits.get(key);
      return {
        date: cell.date,
        availability: cell.availability,
        effectiveShift: edit ? edit.newShift : cell.effectiveShift,
      };
    }),
  }));
}

/**
 * Compute per-day counts from effective rows (single source of truth).
 */
export function computeDayCounts(effectiveRows: EffectiveRow[]): DayCounts[] {
  return computeCountsFromGridRows(effectiveRows);
}

export type ExcelSlotDay = {
  date: string;
  dayOfWeek: number;
  isFriday: boolean;
  minAm: number;
  minPm: number;
};

export type ExcelSlotsResult = {
  days: ExcelSlotDay[];
  /** morningSlots[dayIndex][slotIndex] = empId (or null for empty slot) */
  morningSlots: (string | null)[][];
  /** eveningSlots[dayIndex][slotIndex] = empId (or null) */
  eveningSlots: (string | null)[][];
  maxMorning: number;
  maxEvening: number;
  /** Eligible employee ids for each day (WORK availability) for dropdown candidates */
  eligibleByDay: Array<{ empId: string; name: string; team: string }[]>;
  /** AM/PM counts per day from effective state */
  counts: DayCounts[];
};

/**
 * Build Excel slot layout from effective state.
 * Friday: no morning boutique shift — morning slots for Friday are always empty in output.
 */
export function buildExcelSlots(
  effectiveRows: EffectiveRow[],
  days: Array<{ date: string; dayOfWeek: number; minAm: number; minPm: number }>,
  teamFilter: 'all' | 'A' | 'B'
): ExcelSlotsResult {
  const filtered =
    teamFilter === 'all'
      ? effectiveRows
      : effectiveRows.filter((r) => r.team === teamFilter);

  const counts = computeDayCounts(filtered);

  const morningSlots: (string | null)[][] = [];
  const eveningSlots: (string | null)[][] = [];
  const eligibleByDay: Array<{ empId: string; name: string; team: string }[]> = [];

  for (let dayIdx = 0; dayIdx < days.length; dayIdx++) {
    const day = days[dayIdx];
    const isFriday = day.dayOfWeek === FRIDAY_DAY_OF_WEEK;

    const morning: string[] = [];
    const evening: string[] = [];
    const eligible: { empId: string; name: string; team: string }[] = [];

    for (const row of filtered) {
      const cell = row.cells[dayIdx];
      if (!cell || cell.availability !== 'WORK') continue;
      eligible.push({ empId: row.empId, name: row.name, team: row.team });
      if (isFriday) {
        if (cell.effectiveShift === 'EVENING') evening.push(row.empId);
      } else {
        if (cell.effectiveShift === 'MORNING') morning.push(row.empId);
        if (cell.effectiveShift === 'EVENING') evening.push(row.empId);
      }
    }

    morningSlots.push(morning.map((id) => id));
    eveningSlots.push(evening.map((id) => id));
    eligibleByDay.push(eligible);
  }

  const maxMorning = Math.max(2, ...morningSlots.map((arr) => arr.length));
  const maxEvening = Math.max(2, ...eveningSlots.map((arr) => arr.length));

  const paddedMorning = morningSlots.map((arr) => {
    const pad = Array<string | null>(maxMorning).fill(null);
    arr.forEach((id, i) => (pad[i] = id));
    return pad;
  });
  const paddedEvening = eveningSlots.map((arr) => {
    const pad = Array<string | null>(maxEvening).fill(null);
    arr.forEach((id, i) => (pad[i] = id));
    return pad;
  });

  const excelDays: ExcelSlotDay[] = days.map((d) => ({
    date: d.date,
    dayOfWeek: d.dayOfWeek,
    isFriday: d.dayOfWeek === FRIDAY_DAY_OF_WEEK,
    minAm: d.minAm,
    minPm: d.minPm,
  }));

  return {
    days: excelDays,
    morningSlots: paddedMorning,
    eveningSlots: paddedEvening,
    maxMorning,
    maxEvening,
    eligibleByDay,
    counts,
  };
}
