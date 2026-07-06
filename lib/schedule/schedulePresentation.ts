/**
 * Presentation helpers for the manager-facing Schedule Solver view.
 */

import { parseTimeToMinutes } from '@/lib/schedule/generateSchedule/timeSlots';
import { FRIDAY_DOW } from '@/lib/schedule/generateSchedule/operatingPeriods';
import { countAmPmForDay } from '@/lib/schedule/plannerGuidedSolver';
import { BRIDGE_COMPENSATION_HOURS } from '@/lib/schedule/resourcePlanner';
import type {
  DayOperatingConfig,
  EmployeeDayAssignment,
  EmployeeWeekSummary,
  SlotViolation,
} from '@/lib/schedule/generateSchedule/types';

const SAT_FRI_ORDER = [6, 0, 1, 2, 3, 4, 5];

export function sortDaysSatToFri(days: DayOperatingConfig[]): DayOperatingConfig[] {
  return [...days].sort((a, b) => SAT_FRI_ORDER.indexOf(a.dayOfWeek) - SAT_FRI_ORDER.indexOf(b.dayOfWeek));
}

export function dayShortLabel(dayOfWeek: number): string {
  const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return names[dayOfWeek] ?? `D${dayOfWeek}`;
}

export type ScheduleGridRow = {
  empId: string;
  name: string;
  cells: Map<string, EmployeeDayAssignment>;
};

export function buildScheduleGrid(
  assignments: EmployeeDayAssignment[],
  days: DayOperatingConfig[]
): ScheduleGridRow[] {
  const byEmp = new Map<string, ScheduleGridRow>();
  for (const a of assignments) {
    if (!days.some((d) => d.date === a.date)) continue;
    let row = byEmp.get(a.empId);
    if (!row) {
      row = { empId: a.empId, name: a.name, cells: new Map() };
      byEmp.set(a.empId, row);
    }
    row.cells.set(a.date, a);
  }
  return Array.from(byEmp.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export type ScheduleSummary = {
  coveragePercent: number;
  coverageComplete: boolean;
  amDaysMet: number;
  pmDaysMet: number;
  totalWorkDays: number;
  bridgeDays: number;
  overtimeHours: number;
  compensationHours: number;
  missingCoverage: string[];
};

function violationPeriod(v: SlotViolation, day: DayOperatingConfig): 'AM' | 'PM' {
  if (day.dayOfWeek === FRIDAY_DOW && !day.isRamadan) return 'PM';
  if (day.operatingPeriods.length >= 2) {
    const pmStart = parseTimeToMinutes(day.operatingPeriods[1].startTime);
    return parseTimeToMinutes(v.startTime) >= pmStart ? 'PM' : 'AM';
  }
  const mid = parseTimeToMinutes('15:00');
  return parseTimeToMinutes(v.startTime) < mid ? 'AM' : 'PM';
}

export function computeScheduleSummary(
  assignments: EmployeeDayAssignment[],
  days: DayOperatingConfig[],
  violations: SlotViolation[],
  summaries: EmployeeWeekSummary[],
  coverageValid: boolean
): ScheduleSummary {
  let amDaysMet = 0;
  let pmDaysMet = 0;
  let totalWorkDays = 0;

  days.forEach((day) => {
    if (day.dayOfWeek === FRIDAY_DOW && !day.isRamadan) {
      totalWorkDays += 1;
      const dayShifts = assignments
        .filter((a) => a.date === day.date && a.segments.length > 0)
        .map((a) => ({
          empId: a.empId,
          name: a.name,
          date: a.date,
          isExternalSupport: a.isExternalSupport,
          segments: a.segments,
          reasons: a.reasons,
        }));
      const { pm } = countAmPmForDay(dayShifts, day.operatingPeriods, day.dayOfWeek, day.isRamadan);
      if (pm >= 2) pmDaysMet += 1;
      return;
    }
    totalWorkDays += 1;
    const dayShifts = assignments
      .filter((a) => a.date === day.date && a.segments.length > 0)
      .map((a) => ({
        empId: a.empId,
        name: a.name,
        date: a.date,
        isExternalSupport: a.isExternalSupport,
        segments: a.segments,
        reasons: a.reasons,
      }));
    const { am, pm } = countAmPmForDay(dayShifts, day.operatingPeriods, day.dayOfWeek, day.isRamadan);
    if (am >= 2) amDaysMet += 1;
    if (pm >= 2) pmDaysMet += 1;
  });

  const missingSet = new Set<string>();
  const violationsByDate = new Map<string, SlotViolation[]>();
  violations.forEach((v) => {
    violationsByDate.set(v.date, [...(violationsByDate.get(v.date) ?? []), v]);
  });
  days.forEach((day) => {
    const dayViolations = violationsByDate.get(day.date);
    if (!dayViolations?.length) return;
    const periods = new Set<'AM' | 'PM'>();
    dayViolations.forEach((v) => periods.add(violationPeriod(v, day)));
    periods.forEach((p) => {
      missingSet.add(`${dayShortLabel(day.dayOfWeek)} ${p}`);
    });
  });

  const bridgeDays = summaries.reduce((s, e) => s + e.bridgeDays, 0);
  const overtimeHours = Math.round(summaries.reduce((s, e) => s + e.overtimeHours, 0) * 10) / 10;
  const compensationHours =
    Math.round(summaries.reduce((s, e) => s + e.compensationOwedHours, 0) * 10) / 10;

  const coveragePercent = coverageValid
    ? 100
    : Math.max(0, Math.min(99, 100 - violations.length * 2));

  return {
    coveragePercent,
    coverageComplete: coverageValid,
    amDaysMet,
    pmDaysMet,
    totalWorkDays,
    bridgeDays,
    overtimeHours,
    compensationHours,
    missingCoverage: Array.from(missingSet),
  };
}

export function buildScheduleExplanation(
  assignments: EmployeeDayAssignment[],
  days: DayOperatingConfig[],
  summary: ScheduleSummary
): string[] {
  const bullets: string[] = [];

  const bridgeDays = days.filter((day) =>
    assignments.some((a) => a.date === day.date && a.shiftKind === 'Bridge')
  );
  if (bridgeDays.length > 0) {
    const labels = bridgeDays.map((d) => dayShortLabel(d.dayOfWeek)).join(', ');
    bullets.push(
      `${labels} use Bridge because only three employees were available on those days.`
    );
  }

  const friday = days.find((d) => d.dayOfWeek === FRIDAY_DOW && !d.isRamadan);
  if (friday) {
    bullets.push('Friday uses PM only.');
  }

  if (summary.overtimeHours <= 0) {
    bullets.push('No overtime required.');
  } else {
    bullets.push(`${summary.overtimeHours}h overtime included to close coverage gaps.`);
  }

  const bridgeEmps = new Set(
    assignments.filter((a) => a.shiftKind === 'Bridge').map((a) => a.name)
  );
  if (bridgeEmps.size > 1 && summary.bridgeDays > 0) {
    bullets.push('Bridge shifts are rotated fairly across the team.');
  }

  if (!summary.coverageComplete && summary.missingCoverage.length > 0) {
    bullets.push(
      `Missing coverage: ${summary.missingCoverage.slice(0, 3).join(', ')}.`
    );
  }

  if (summary.compensationHours > 0) {
    bullets.push(
      `${summary.compensationHours}h compensation owed for bridge and extra work.`
    );
  }

  return bullets.slice(0, 5);
}

export function cellCompensationHours(assignment: EmployeeDayAssignment): number {
  if (assignment.shiftKind === 'Bridge') return BRIDGE_COMPENSATION_HOURS;
  return 0;
}
