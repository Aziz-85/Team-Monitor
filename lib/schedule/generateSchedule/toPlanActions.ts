/**
 * Bridge dynamic schedule output to grid shift proposals and plan actions.
 */

import type { PlanAction } from '@/lib/services/schedulePlanner';
import type {
  DaySlotBundle,
  EmployeeDayAssignment,
  GenerateScheduleResult,
  GridShiftProposal,
  ShiftSegment,
} from './types';
import { parseTimeToMinutes, periodBounds } from './timeSlots';

function segmentMidpointMinutes(segment: ShiftSegment): number {
  const start = parseTimeToMinutes(segment.startTime);
  let end = parseTimeToMinutes(segment.endTime);
  if (end <= start) end += 24 * 60;
  return (start + end) / 2;
}

/** Map dynamic segments to MORNING | EVENING | SPLIT for the existing grid. */
export function segmentsToGridShift(
  segments: ShiftSegment[],
  bundle: DaySlotBundle | undefined
): 'MORNING' | 'EVENING' | 'SPLIT' | 'NONE' {
  if (!segments.length) return 'NONE';
  const periodIndexes = new Set(segments.map((s) => s.periodIndex));
  if (periodIndexes.size >= 2) return 'SPLIT';

  const periodCount = bundle?.operatingPeriods.length ?? 1;
  if (periodCount >= 2) {
    const idx = segments[0]?.periodIndex ?? 0;
    return idx === 0 ? 'MORNING' : 'EVENING';
  }

  const period = bundle?.operatingPeriods[0];
  if (!period) return 'MORNING';
  const { start, end } = periodBounds(period);
  const mid = segmentMidpointMinutes(segments[0]);
  const periodMid = (start + end) / 2;
  return mid <= periodMid ? 'MORNING' : 'EVENING';
}

export function assignmentsToGridProposals(
  assignments: EmployeeDayAssignment[],
  bundles: DaySlotBundle[],
  currentShifts: Array<{ empId: string; date: string; shift: string; availability: string }>
): GridShiftProposal[] {
  const bundleByDate = new Map(bundles.map((b) => [b.date, b]));
  const currentMap = new Map(currentShifts.map((s) => [`${s.empId}|${s.date}`, s]));

  const proposals: GridShiftProposal[] = [];
  for (const a of assignments) {
    if (a.shiftKind === 'Leave' || a.shiftKind === 'Off') continue;

    const bundle = bundleByDate.get(a.date);
    const gridShift = segmentsToGridShift(a.segments, bundle);
    const cur = currentMap.get(`${a.empId}|${a.date}`);
    const fromShift = cur?.availability === 'WORK' ? cur.shift : 'NONE';

    if (fromShift === gridShift && a.segments.length > 0) continue;
    if (gridShift === 'NONE' && fromShift === 'NONE') continue;

    proposals.push({
      empId: a.empId,
      date: a.date,
      shift: gridShift,
      shiftKind: a.shiftKind,
      segments: a.segments,
      totalHours: a.totalHours,
      reason: a.reasons.join('; ') || 'Generated schedule',
    });
  }
  return proposals;
}

export function proposalsToPlanActions(
  proposals: GridShiftProposal[],
  gridRows: Array<{ empId: string; name: string; cells: Array<{ date: string; effectiveShift: string }> }>,
  fairnessScore: number
): PlanAction[] {
  const nameByEmp = new Map(gridRows.map((r) => [r.empId, r.name]));
  const dayIndexByDate = new Map<string, number>();
  if (gridRows[0]?.cells) {
    gridRows[0].cells.forEach((c, i) => dayIndexByDate.set(c.date, i));
  }

  return proposals.map((p, idx) => {
    const row = gridRows.find((r) => r.empId === p.empId);
    const cell = row?.cells.find((c) => c.date === p.date);
    const fromShift = cell?.effectiveShift ?? 'NONE';
    return {
      id: `gen-${p.empId}-${p.date}-${idx}`,
      type: 'SHIFT_CHANGE' as const,
      date: p.date,
      dayIndex: dayIndexByDate.get(p.date) ?? 0,
      empId: p.empId,
      employeeName: nameByEmp.get(p.empId) ?? p.empId,
      fromShift,
      toShift: p.shift,
      reason: p.reason,
      fairnessScore,
    };
  });
}

export function generateResultToPlanActions(
  result: GenerateScheduleResult,
  gridRows: Array<{ empId: string; name: string; cells: Array<{ date: string; effectiveShift: string }> }>
): PlanAction[] {
  return proposalsToPlanActions(result.proposals, gridRows, result.fairnessScore);
}
