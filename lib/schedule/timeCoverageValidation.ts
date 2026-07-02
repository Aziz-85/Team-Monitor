/**
 * Time-slot coverage validation for the schedule grid using saved segments.
 */

import type { GridRow, DayCountContext } from '@/lib/services/scheduleGrid';
import type { SlotViolation } from '@/lib/schedule/generateSchedule/types';
import { buildTimeSlots, validateCoverage } from '@/lib/schedule/generateSchedule/timeSlots';
import type { DaySlotBundle, WorkingDayShift } from '@/lib/schedule/generateSchedule/types';
import { shiftToSegmentsForCounting } from '@/lib/schedule/segmentCoverage';

export type TimeCoverageResult = {
  valid: boolean;
  violations: SlotViolation[];
};

export function formatSlotViolationMessage(v: SlotViolation): string {
  return `Slot ${v.startTime}–${v.endTime}: ${v.coverage}/${v.minCoverage} staff`;
}

export function groupSlotViolationsByDate(violations: SlotViolation[]): Map<string, SlotViolation[]> {
  const map = new Map<string, SlotViolation[]>();
  for (const v of violations) {
    const list = map.get(v.date) ?? [];
    list.push(v);
    map.set(v.date, list);
  }
  return map;
}

function bundlesFromContexts(dayCountContexts: DayCountContext[], intervalMinutes = 30): DaySlotBundle[] {
  return dayCountContexts.map((ctx) => ({
    date: ctx.date,
    dayOfWeek: ctx.dayOfWeek,
    isRamadan: ctx.isRamadan,
    operatingPeriods: ctx.operatingPeriods,
    slots: buildTimeSlots(ctx.operatingPeriods, ctx.date, intervalMinutes),
  }));
}

function segmentsForCell(
  cell: { effectiveShift: string; segments?: Array<{ startTime: string; endTime: string; periodIndex: number }> },
  ctx: DayCountContext
): Array<{ startTime: string; endTime: string; periodIndex: number }> {
  if (cell.segments?.length) return cell.segments;
  return shiftToSegmentsForCounting(cell.effectiveShift, ctx.operatingPeriods, ctx.maxDailyHours);
}

/** Validate 30-minute slot coverage using saved segments (fallback: synthetic from shift enum). */
export function validateTimeCoverageForGrid(
  rows: GridRow[],
  dayCountContexts: DayCountContext[],
  extraShiftsByDate?: Map<string, WorkingDayShift[]>,
  intervalMinutes = 30
): TimeCoverageResult {
  const bundles = bundlesFromContexts(dayCountContexts, intervalMinutes);
  const ctxByDate = new Map(dayCountContexts.map((c) => [c.date, c]));
  const byDate = new Map<string, WorkingDayShift[]>();

  for (const row of rows) {
    for (const cell of row.cells) {
      if (cell.availability !== 'WORK') continue;
      const ctx = ctxByDate.get(cell.date);
      if (!ctx) continue;
      const segments = segmentsForCell(cell, ctx);
      if (!segments.length) continue;
      const list = byDate.get(cell.date) ?? [];
      list.push({
        empId: row.empId,
        name: row.name,
        date: cell.date,
        isExternalSupport: Boolean(row.isGuest),
        segments,
        reasons: [],
      });
      byDate.set(cell.date, list);
    }
  }

  if (extraShiftsByDate) {
    Array.from(extraShiftsByDate.entries()).forEach(([date, extras]) => {
      const list = byDate.get(date) ?? [];
      byDate.set(date, [...list, ...extras]);
    });
  }

  const { valid, violations } = validateCoverage(bundles, byDate);
  return { valid, violations };
}
