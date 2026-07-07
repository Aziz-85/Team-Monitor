/**
 * Present engine proposals as day rows for the Schedule Editor review table.
 */

import { segmentsAmPmContribution } from '@/lib/schedule/segmentCoverage';
import { isBridgeShiftSegments, countAmPmForDay } from '@/lib/schedule/plannerGuidedSolver';
import { BRIDGE_COMPENSATION_HOURS } from '@/lib/schedule/resourcePlanner';
import type {
  DayOperatingConfig,
  EmployeeDayAssignment,
  GenerateScheduleResult,
  ShiftSegment,
  SlotViolation,
} from '@/lib/schedule/generateSchedule/types';
import type { PlanAction } from '@/lib/services/schedulePlanner';
import type { ScheduleGridResult } from '@/lib/services/scheduleGrid';
import type { ProposalQualityResult } from '@/lib/schedule/proposalQualityGate';

export type ProposalPerson = {
  empId: string;
  name: string;
  kind: 'AM' | 'PM' | 'Bridge' | 'Split' | 'External';
  movedWeeklyOff?: boolean;
  segments: ShiftSegment[];
};

export type ProposalDayRow = {
  date: string;
  dayName: string;
  morning: ProposalPerson[];
  afternoon: ProposalPerson[];
  externalCoverage: ProposalPerson[];
  amCount: number;
  pmCount: number;
  coverageValid: boolean;
};

export type ProposalSummary = {
  coverageValid: boolean;
  bridgeCount: number;
  overtimeHours: number;
  compensationHours: number;
  weeklyOffMoves: number;
  externalSupportHours: number;
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function assignmentKind(
  assignment: EmployeeDayAssignment,
  periods: DayOperatingConfig['operatingPeriods'],
  dayOfWeek: number,
  isRamadan: boolean
): ProposalPerson['kind'] {
  if (assignment.isExternalSupport) return 'External';
  if (assignment.shiftKind === 'Bridge' || isBridgeShiftSegments(assignment.segments)) return 'Bridge';
  if (assignment.splitDay) return 'Split';
  const contrib = segmentsAmPmContribution(assignment.segments, periods, dayOfWeek, isRamadan);
  if (contrib.am && contrib.pm) return 'Bridge';
  if (contrib.pm) return 'PM';
  return 'AM';
}

function movedWeeklyOffSet(
  grid: ScheduleGridResult,
  weeklyOffVariant?: Record<string, number>
): Set<string> {
  const moved = new Set<string>();
  if (!weeklyOffVariant) return moved;
  for (const row of grid.rows) {
    if (row.isGuest) continue;
    const base = row.effectiveWeeklyOffDay;
    if (base === 'NONE') continue;
    const variant = weeklyOffVariant[row.empId];
    if (variant !== undefined && variant !== base) {
      moved.add(row.empId);
    }
  }
  return moved;
}

export function buildProposalDayRows(
  days: DayOperatingConfig[],
  assignments: EmployeeDayAssignment[],
  grid: ScheduleGridResult,
  slotViolations: SlotViolation[],
  weeklyOffVariant?: Record<string, number>
): ProposalDayRow[] {
  const violationsByDate = new Map<string, number>();
  slotViolations.forEach((v) => {
    violationsByDate.set(v.date, (violationsByDate.get(v.date) ?? 0) + 1);
  });
  const moved = movedWeeklyOffSet(grid, weeklyOffVariant);

  return days.map((day) => {
    const dayAssignments = assignments.filter(
      (a) => a.date === day.date && a.shiftKind !== 'Off' && a.shiftKind !== 'Leave' && a.segments.length > 0
    );

    const morning: ProposalPerson[] = [];
    const afternoon: ProposalPerson[] = [];
    const externalCoverage: ProposalPerson[] = [];

    for (const a of dayAssignments) {
      const kind = assignmentKind(a, day.operatingPeriods, day.dayOfWeek, day.isRamadan);
      const person: ProposalPerson = {
        empId: a.empId,
        name: a.name,
        kind: a.isExternalSupport ? 'External' : kind,
        movedWeeklyOff: moved.has(a.empId),
        segments: a.segments,
      };

      if (a.isExternalSupport) {
        externalCoverage.push(person);
        continue;
      }

      const contrib = segmentsAmPmContribution(a.segments, day.operatingPeriods, day.dayOfWeek, day.isRamadan);
      const isBridge = kind === 'Bridge' || (contrib.am && contrib.pm);

      if (isBridge || contrib.am) morning.push(person);
      if (isBridge || contrib.pm) afternoon.push(person);
    }

    const dayShifts = dayAssignments.map((a) => ({
      empId: a.empId,
      name: a.name,
      date: a.date,
      isExternalSupport: a.isExternalSupport,
      segments: a.segments,
      reasons: a.reasons,
    }));
    const { am, pm } = countAmPmForDay(dayShifts, day.operatingPeriods, day.dayOfWeek, day.isRamadan);

    return {
      date: day.date,
      dayName: DAY_NAMES[day.dayOfWeek] ?? `Day ${day.dayOfWeek}`,
      morning,
      afternoon,
      externalCoverage,
      amCount: am,
      pmCount: pm,
      coverageValid: (violationsByDate.get(day.date) ?? 0) === 0,
    };
  });
}

export function buildProposalSummary(
  result: GenerateScheduleResult,
  grid: ScheduleGridResult,
  weeklyOffVariant?: Record<string, number>
): ProposalSummary {
  const bridgeCount = result.employeeSummaries.reduce((s, e) => s + e.bridgeDays, 0);
  const overtimeHours =
    Math.round(result.employeeSummaries.reduce((s, e) => s + e.overtimeHours, 0) * 10) / 10;
  const compensationHours =
    Math.round(result.employeeSummaries.reduce((s, e) => s + e.compensationOwedHours, 0) * 10) / 10;

  let weeklyOffMoves = 0;
  if (weeklyOffVariant) {
    for (const row of grid.rows) {
      if (row.isGuest) continue;
      const base = row.effectiveWeeklyOffDay;
      if (base === 'NONE') continue;
      const v = weeklyOffVariant[row.empId];
      if (v !== undefined && v !== base) weeklyOffMoves += 1;
    }
  }

  const externalSupportHours = result.assignments
    .filter((a) => a.isExternalSupport && a.segments.length > 0)
    .reduce((s, a) => s + a.totalHours, 0);

  return {
    coverageValid: result.coverageValid,
    bridgeCount,
    overtimeHours,
    compensationHours: compensationHours || bridgeCount * BRIDGE_COMPENSATION_HOURS,
    weeklyOffMoves,
    externalSupportHours: Math.round(externalSupportHours * 10) / 10,
  };
}

export function buildProposalInsights(
  rows: ProposalDayRow[],
  summary: ProposalSummary
): string[] {
  const insights: string[] = [];

  const bridgeDays = rows.filter((r) => r.morning.some((p) => p.kind === 'Bridge') || r.afternoon.some((p) => p.kind === 'Bridge'));
  if (bridgeDays.length > 0) {
    insights.push(
      `Bridge shifts on ${bridgeDays.map((d) => d.dayName).join(', ')} to cover AM and PM with limited staff.`
    );
  }

  const friday = rows.find((r) => r.dayName === 'Friday');
  if (friday && friday.pmCount >= 2 && friday.amCount === 0) {
    insights.push('Friday is PM-only as per boutique policy.');
  }

  if (summary.weeklyOffMoves > 0) {
    insights.push(`${summary.weeklyOffMoves} weekly off day(s) moved for this week only.`);
  }

  if (summary.compensationHours > 0) {
    insights.push(`${summary.compensationHours}h compensation owed for bridge and extra work.`);
  }

  const gaps = rows.filter((r) => !r.coverageValid);
  if (gaps.length > 0) {
    insights.push(`Coverage gaps on ${gaps.map((g) => g.dayName).join(', ')} — review before applying.`);
  } else if (summary.coverageValid) {
    insights.push('All time slots meet minimum coverage.');
  }

  if (summary.overtimeHours > 0) {
    insights.push(`${summary.overtimeHours}h overtime included in this proposal.`);
  }

  return insights.slice(0, 5);
}

export type ProposalApiResponse = {
  proposalId: string;
  proposalNumber: number;
  rows: ProposalDayRow[];
  actions: PlanAction[];
  summary: ProposalSummary;
  insights: string[];
  quality: ProposalQualityResult;
  status: ProposalQualityResult['status'];
  statusLabel: string | null;
};

export function presentProposal(
  generateResult: GenerateScheduleResult,
  actions: PlanAction[],
  grid: ScheduleGridResult,
  days: DayOperatingConfig[],
  meta: { proposalId: string; proposalNumber: number },
  quality: ProposalQualityResult
): ProposalApiResponse {
  const rows = buildProposalDayRows(
    days,
    generateResult.assignments,
    grid,
    generateResult.slotViolations,
    generateResult.weeklyOffVariant
  );
  const summary = buildProposalSummary(generateResult, grid, generateResult.weeklyOffVariant);
  const insights = buildProposalInsights(rows, summary);

  const statusLabel =
    quality.status === 'INCOMPLETE' ? 'Best achievable schedule' : quality.status === 'ACCEPTABLE' ? null : null;

  return {
    proposalId: meta.proposalId,
    proposalNumber: meta.proposalNumber,
    rows,
    actions,
    summary,
    insights,
    quality,
    status: quality.status,
    statusLabel,
  };
}
