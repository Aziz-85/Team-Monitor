/**
 * Fairness scoring and split-day counting for dynamic schedule generation.
 */

import type {
  DaySlotBundle,
  EmployeeDayAssignment,
  EmployeeWeekSummary,
  GenerateScheduleInput,
  HistoricalEmployeeStats,
  WorkingDayShift,
} from './types';
import { dayTotalHours } from './timeSlots';
import { FRIDAY_DOW } from './operatingPeriods';
import { isBridgeShiftSegments, BRIDGE_COMPENSATION_HOURS } from '@/lib/schedule/plannerGuidedSolver';
import { segmentsAmPmContribution } from '@/lib/schedule/segmentCoverage';

export function countEmployeeWeeklySplitDays(
  employeeId: string,
  assignments: Array<Pick<EmployeeDayAssignment, 'empId' | 'date' | 'splitDay'>>
): number {
  const dates = new Set<string>();
  for (const a of assignments) {
    if (a.empId === employeeId && a.splitDay) dates.add(a.date);
  }
  return dates.size;
}

export type FairnessBreakdown = {
  score: number;
  hourVariancePenalty: number;
  splitPenalty: number;
  overtimePenalty: number;
  fridayBalancePenalty: number;
  historicalRotationPenalty: number;
  externalUsePenalty: number;
};

export function calculateFairnessScore(
  assignments: EmployeeDayAssignment[],
  input: Pick<GenerateScheduleInput, 'historicalStats' | 'settings' | 'days'>,
  slotViolations: number
): FairnessBreakdown {
  const maxDaily = input.days.some((d) => d.isRamadan)
    ? input.settings.ramadanMode.maxDailyHours
    : input.settings.normalMode.maxDailyHours;

  const hoursByEmp = new Map<string, number>();
  const fridayHoursByEmp = new Map<string, number>();
  const splitDaysByEmp = new Map<string, number>();
  let externalDays = 0;
  let overtimeHours = 0;

  for (const a of assignments) {
    hoursByEmp.set(a.empId, (hoursByEmp.get(a.empId) ?? 0) + a.totalHours);
    if (a.splitDay) splitDaysByEmp.set(a.empId, (splitDaysByEmp.get(a.empId) ?? 0) + 1);
    if (a.isExternalSupport && a.segments.length > 0) externalDays++;
    const day = input.days.find((d) => d.date === a.date);
    if (day?.dayOfWeek === FRIDAY_DOW && a.totalHours > 0) {
      fridayHoursByEmp.set(a.empId, (fridayHoursByEmp.get(a.empId) ?? 0) + a.totalHours);
    }
    if (a.totalHours > maxDaily) overtimeHours += a.totalHours - maxDaily;
  }

  const hourValues = Array.from(hoursByEmp.values());
  const avgHours = hourValues.length ? hourValues.reduce((s, v) => s + v, 0) / hourValues.length : 0;
  const hourVariancePenalty = hourValues.reduce((s, h) => s + Math.abs(h - avgHours) ** 2, 0);

  let splitPenalty = 0;
  Array.from(splitDaysByEmp.entries()).forEach(([, count]) => {
    splitPenalty += count * 8;
    if (count > input.settings.maxSplitDaysPerEmployeePerWeek) {
      splitPenalty += (count - input.settings.maxSplitDaysPerEmployeePerWeek) * 20;
    }
  });

  const histMap = new Map(input.historicalStats.map((h) => [h.empId, h]));
  let historicalRotationPenalty = 0;
  Array.from(hoursByEmp.entries()).forEach(([empId, hours]) => {
    const hist = histMap.get(empId);
    if (!hist) return;
    historicalRotationPenalty += Math.abs(hours - hist.priorWeekHours) * 0.5;
    historicalRotationPenalty += hist.priorWeekSplitDays * 2;
  });

  const fridayTotals = Array.from(fridayHoursByEmp.values());
  const fridayAvg = fridayTotals.length ? fridayTotals.reduce((s, v) => s + v, 0) / fridayTotals.length : 0;
  const fridayBalancePenalty = fridayTotals.reduce((s, h) => s + Math.abs(h - fridayAvg), 0);

  const coveragePenalty = slotViolations * 1000;
  const overtimePenalty = overtimeHours * 15;
  const externalUsePenalty = externalDays * 5;

  const score =
    coveragePenalty +
    hourVariancePenalty +
    splitPenalty +
    overtimePenalty +
    fridayBalancePenalty +
    historicalRotationPenalty +
    externalUsePenalty;

  return {
    score,
    hourVariancePenalty,
    splitPenalty,
    overtimePenalty,
    fridayBalancePenalty,
    historicalRotationPenalty,
    externalUsePenalty,
  };
}

export function buildEmployeeSummaries(
  assignments: EmployeeDayAssignment[],
  maxDailyHours: number
): EmployeeWeekSummary[] {
  const byEmp = new Map<string, EmployeeWeekSummary>();
  for (const a of assignments) {
    const cur = byEmp.get(a.empId) ?? {
      empId: a.empId,
      name: a.name,
      totalHours: 0,
      splitDays: 0,
      overtimeHours: 0,
      amDays: 0,
      pmDays: 0,
      bridgeDays: 0,
      leaveDays: 0,
      offDays: 0,
      compensationOwedHours: 0,
    };
    cur.totalHours += a.totalHours;
    if (a.shiftKind === 'Leave') cur.leaveDays += 1;
    else if (a.shiftKind === 'Off') cur.offDays += 1;
    else if (a.shiftKind === 'Bridge') {
      cur.bridgeDays += 1;
      cur.compensationOwedHours += BRIDGE_COMPENSATION_HOURS;
    } else if (a.splitDay) cur.splitDays += 1;
    else if (a.shiftKind === 'AM') cur.amDays += 1;
    else if (a.shiftKind === 'PM') cur.pmDays += 1;
    if (a.totalHours > maxDailyHours) cur.overtimeHours += a.totalHours - maxDailyHours;
    byEmp.set(a.empId, cur);
  }
  return Array.from(byEmp.values()).sort((a, b) => b.totalHours - a.totalHours);
}

function resolveShiftKind(
  w: WorkingDayShift,
  day: GenerateScheduleInput['days'][number],
  periodCount: number
): EmployeeDayAssignment['shiftKind'] {
  if (!w.segments.length) return 'Off';
  if (isBridgeShiftSegments(w.segments)) return 'Bridge';
  const periodIndexes = new Set(w.segments.map((s) => s.periodIndex));
  const splitDay = periodIndexes.size >= 2;
  if (splitDay) return 'Split';
  if (w.isExternalSupport) return 'Support';
  const { am, pm } = segmentsAmPmContribution(
    w.segments,
    day.operatingPeriods,
    day.dayOfWeek,
    day.isRamadan
  );
  if (am && !pm) return 'AM';
  if (pm && !am) return 'PM';
  if (periodCount > 1 && periodIndexes.has(0) && !periodIndexes.has(1)) return 'AM';
  if (periodCount > 1 && periodIndexes.has(1)) return 'PM';
  return am ? 'AM' : 'PM';
}

export function buildFullWeekAssignments(
  input: GenerateScheduleInput,
  working: WorkingDayShift[],
  bundles: DaySlotBundle[],
  unavailKind: Map<string, string>
): EmployeeDayAssignment[] {
  const workingByKey = new Map(working.map((w) => [`${w.empId}|${w.date}`, w]));
  const periodCountByDate = new Map(bundles.map((b) => [b.date, b.operatingPeriods.length]));
  const assignments: EmployeeDayAssignment[] = [];
  const allEmployees = [...input.regularEmployees, ...input.externalSupportEmployees];

  for (const emp of allEmployees) {
    for (const day of input.days) {
      const key = `${emp.empId}|${day.date}`;
      const kind = unavailKind.get(key);

      if (kind === 'leave') {
        assignments.push({
          empId: emp.empId,
          name: emp.name,
          date: day.date,
          isExternalSupport: emp.isExternalSupport,
          segments: [],
          shiftKind: 'Leave',
          totalHours: 0,
          splitDay: false,
          reasons: ['Approved leave on file'],
        });
        continue;
      }
      if (kind === 'weekly_off' || kind === 'holiday') {
        assignments.push({
          empId: emp.empId,
          name: emp.name,
          date: day.date,
          isExternalSupport: emp.isExternalSupport,
          segments: [],
          shiftKind: 'Off',
          totalHours: 0,
          splitDay: false,
          reasons: [kind === 'weekly_off' ? 'Weekly off' : 'Holiday'],
        });
        continue;
      }
      if (kind === 'absent') {
        assignments.push({
          empId: emp.empId,
          name: emp.name,
          date: day.date,
          isExternalSupport: emp.isExternalSupport,
          segments: [],
          shiftKind: 'Off',
          totalHours: 0,
          splitDay: false,
          reasons: ['Absent'],
        });
        continue;
      }

      const w = workingByKey.get(key);
      if (!w || !w.segments.length) {
        assignments.push({
          empId: emp.empId,
          name: emp.name,
          date: day.date,
          isExternalSupport: emp.isExternalSupport,
          segments: [],
          shiftKind: 'Off',
          totalHours: 0,
          splitDay: false,
          reasons: ['Not scheduled'],
        });
        continue;
      }

      const periodCount = periodCountByDate.get(day.date) ?? 1;
      const bridgeDay = isBridgeShiftSegments(w.segments);
      const periodIndexes = new Set(w.segments.map((s) => s.periodIndex));
      const splitDay = !bridgeDay && periodIndexes.size >= 2;
      const totalHours = dayTotalHours(w.segments);
      const shiftKind = resolveShiftKind(w, day, periodCount);

      assignments.push({
        empId: w.empId,
        name: w.name,
        date: w.date,
        isExternalSupport: w.isExternalSupport,
        segments: w.segments,
        shiftKind,
        totalHours,
        splitDay,
        reasons: w.reasons,
      });
    }
  }

  return assignments;
}

export function workingShiftsToAssignments(
  working: WorkingDayShift[],
  bundles: DaySlotBundle[],
  unavailKind: Map<string, string>
): EmployeeDayAssignment[] {
  const periodCountByDate = new Map(bundles.map((b) => [b.date, b.operatingPeriods.length]));
  return working.map((w) => {
    const key = `${w.empId}|${w.date}`;
    const kind = unavailKind.get(key);
    if (kind === 'leave') {
      return {
        empId: w.empId,
        name: w.name,
        date: w.date,
        isExternalSupport: w.isExternalSupport,
        segments: [],
        shiftKind: 'Leave',
        totalHours: 0,
        splitDay: false,
        reasons: ['Approved leave'],
      };
    }
    if (kind === 'weekly_off' || kind === 'holiday') {
      return {
        empId: w.empId,
        name: w.name,
        date: w.date,
        isExternalSupport: w.isExternalSupport,
        segments: [],
        shiftKind: 'Off',
        totalHours: 0,
        splitDay: false,
        reasons: [kind === 'weekly_off' ? 'Weekly off' : 'Holiday'],
      };
    }
    const periodCount = periodCountByDate.get(w.date) ?? 1;
    const day = bundles.find((b) => b.date === w.date);
    const bridgeDay = isBridgeShiftSegments(w.segments);
    const periodIndexes = new Set(w.segments.map((s) => s.periodIndex));
    const splitDay = !bridgeDay && periodIndexes.size >= 2;
    const totalHours = dayTotalHours(w.segments);
    let shiftKind: EmployeeDayAssignment['shiftKind'] = 'Off';
    if (w.segments.length) {
      if (day) {
        shiftKind = resolveShiftKind(w, day, periodCount);
      } else if (bridgeDay) shiftKind = 'Bridge';
      else if (splitDay) shiftKind = 'Split';
      else if (w.isExternalSupport) shiftKind = 'Support';
      else shiftKind = 'AM';
    }
    return {
      empId: w.empId,
      name: w.name,
      date: w.date,
      isExternalSupport: w.isExternalSupport,
      segments: w.segments,
      shiftKind,
      totalHours,
      splitDay,
      reasons: w.reasons,
    };
  });
}

export function buildHistoricalStatsFromFairnessRows(
  rows: Array<{ empId: string; pmDays: number; splitDays: number; loadScore: number }>
): HistoricalEmployeeStats[] {
  return rows.map((r) => ({
    empId: r.empId,
    priorWeekHours: r.loadScore,
    priorWeekPmHours: r.pmDays * 8,
    priorWeekFridayHours: 0,
    priorWeekSplitDays: r.splitDays,
  }));
}
