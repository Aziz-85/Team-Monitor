/**
 * Build GenerateScheduleInput from schedule grid + guest shifts.
 */

import type { ScheduleGridResult } from '@/lib/services/scheduleGrid';
import type { GuestShiftInput } from '@/lib/services/schedulePlanGuests';
import type { EmployeeFairnessRow } from '@/lib/services/schedulePlannerFairness';
import { getRamadanRange } from '@/lib/time/ramadan';
import { buildWeekOperatingConfigs } from './operatingPeriods';
import {
  DEFAULT_GENERATE_SETTINGS,
  type EmployeeCandidate,
  type GenerateScheduleInput,
  type Unavailability,
} from './types';
import { buildHistoricalStatsFromFairnessRows } from './fairness';

export function buildGenerateScheduleInput(
  grid: ScheduleGridResult,
  options: {
    guestShifts?: GuestShiftInput[];
    fairnessRows?: EmployeeFairnessRow[];
    settings?: GenerateScheduleInput['settings'];
    ramadanRange?: { start: string; end: string } | null;
    preserveExisting?: boolean;
  } = {}
): GenerateScheduleInput {
  const weekDates = grid.days.map((d) => d.date);
  const ramadanRange = options.ramadanRange ?? getRamadanRange();
  const days = buildWeekOperatingConfigs(weekDates, ramadanRange);

  const regularEmployees: EmployeeCandidate[] = grid.rows
    .filter((r) => !r.isGuest)
    .map((r) => ({
      empId: r.empId,
      name: r.name,
      isExternalSupport: false,
      weeklyOffDay: r.effectiveWeeklyOffDay,
    }));

  const guestByEmp = new Map<string, GuestShiftInput[]>();
  for (const g of options.guestShifts ?? []) {
    const list = guestByEmp.get(g.empId) ?? [];
    list.push(g);
    guestByEmp.set(g.empId, list);
  }

  const externalSupportEmployees: EmployeeCandidate[] = [];
  Array.from(guestByEmp.entries()).forEach(([empId, shifts]) => {
    const first = shifts[0];
    externalSupportEmployees.push({
      empId,
      name: first.employeeName,
      isExternalSupport: true,
      weeklyOffDay: 'NONE',
      sourceBoutiqueId: first.sourceBoutiqueId,
    });
  });

  const unavailability: Unavailability[] = [];
  for (const row of grid.rows) {
    for (const cell of row.cells) {
      if (cell.availability === 'LEAVE') {
        unavailability.push({ empId: row.empId, date: cell.date, kind: 'leave' });
      } else if (cell.availability === 'OFF') {
        unavailability.push({ empId: row.empId, date: cell.date, kind: 'weekly_off' });
      } else if (cell.availability === 'HOLIDAY') {
        unavailability.push({ empId: row.empId, date: cell.date, kind: 'holiday' });
      } else if (cell.availability === 'ABSENT') {
        unavailability.push({ empId: row.empId, date: cell.date, kind: 'absent' });
      }
    }
  }

  const currentShifts: GenerateScheduleInput['currentShifts'] = [];
  for (const row of grid.rows) {
    for (const cell of row.cells) {
      currentShifts.push({
        empId: row.empId,
        date: cell.date,
        shift: cell.effectiveShift,
        availability: cell.availability,
      });
    }
  }
  for (const g of options.guestShifts ?? []) {
    currentShifts.push({
      empId: g.empId,
      date: g.date,
      shift: g.shift,
      availability: 'WORK',
    });
  }

  return {
    weekStart: grid.weekStart,
    days,
    regularEmployees,
    externalSupportEmployees,
    unavailability,
    settings: options.settings ?? DEFAULT_GENERATE_SETTINGS,
    historicalStats: buildHistoricalStatsFromFairnessRows(options.fairnessRows ?? []),
    currentShifts,
    preserveExisting: options.preserveExisting ?? false,
  };
}
