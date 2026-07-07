import { buildWeekOperatingConfigs } from '@/lib/schedule/generateSchedule/operatingPeriods';
import { segmentsAmPmContribution, segmentsToGridShiftEnum } from '@/lib/schedule/segmentCoverage';
import type { PlanAction } from '@/lib/services/schedulePlanner';
import type { GridRow } from '@/lib/services/scheduleGrid';
import { getRamadanRange } from '@/lib/time/ramadan';
import type { ScheduleNextProposal, ScheduleNextProposalRow } from './types';

export function proposalToPlanActions(
  proposal: ScheduleNextProposal,
  gridRows: GridRow[],
  fairnessScore = 80
): PlanAction[] {
  const nameByEmp = new Map(gridRows.map((r) => [r.empId, r.name]));
  const dayIndexByDate = new Map<string, number>();
  if (gridRows[0]?.cells) {
    gridRows[0].cells.forEach((c, i) => dayIndexByDate.set(c.date, i));
  }

  const ramadanRange = getRamadanRange();
  const weekDates = proposal.rows.map((r) => r.date);
  const opByDate = new Map(
    buildWeekOperatingConfigs(weekDates, ramadanRange).map((d) => [d.date, d])
  );

  const actions: PlanAction[] = [];
  let idx = 0;

  for (const row of proposal.rows) {
    const op = opByDate.get(row.date);
    const periods = op?.operatingPeriods ?? [];
    const dayOfWeek = op?.dayOfWeek ?? 0;
    const isRamadan = op?.isRamadan ?? false;

    const allPeople = [...row.morning, ...row.afternoon, ...row.externalCoverage];
    const seen = new Set<string>();
    for (const person of allPeople) {
      if (seen.has(person.empId)) continue;
      seen.add(person.empId);

      const gridRow = gridRows.find((r) => r.empId === person.empId);
      const cell = gridRow?.cells.find((c) => c.date === row.date);
      const fromShift = cell?.availability === 'WORK' ? cell.effectiveShift : 'NONE';
      const toShift = segmentsToGridShiftEnum(person.segments, periods, dayOfWeek, isRamadan);

      if (fromShift === toShift && person.segments.length > 0) continue;

      actions.push({
        id: `next-${person.empId}-${row.date}-${idx++}`,
        type: 'SHIFT_CHANGE',
        date: row.date,
        dayIndex: dayIndexByDate.get(row.date) ?? 0,
        empId: person.empId,
        employeeName: nameByEmp.get(person.empId) ?? person.name,
        fromShift,
        toShift,
        reason: 'Schedule Next proposal',
        fairnessScore,
        segments: person.segments.map((s) => ({ ...s })),
      });
    }
  }

  return actions;
}

export function mergeProposalActions(
  proposal: ScheduleNextProposal,
  gridRows: GridRow[]
): PlanAction[] {
  return proposalToPlanActions(proposal, gridRows);
}

export function externalContribution(
  segments: ScheduleNextProposalRow['externalCoverage'][0]['segments'],
  periods: import('@/lib/schedule/generateSchedule/types').OperatingPeriod[],
  dayOfWeek: number,
  isRamadan: boolean
): { am: boolean; pm: boolean } {
  return segmentsAmPmContribution(segments, periods, dayOfWeek, isRamadan);
}
