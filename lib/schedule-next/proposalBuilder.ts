import { buildWeekOperatingConfigs } from '@/lib/schedule/generateSchedule/operatingPeriods';
import {
  segmentFromPeriodEnd,
  segmentFromPeriodStart,
} from '@/lib/schedule/generateSchedule/timeSlots';
import type { ShiftSegment } from '@/lib/schedule/generateSchedule/types';
import { segmentsAmPmContribution } from '@/lib/schedule/segmentCoverage';
import { getRamadanRange } from '@/lib/time/ramadan';
import { mergeProposalActions } from './applyAdapter';
import { checkProposalCoverage, rowStatusFromCoverage } from './coverageChecker';
import {
  allocateEmployeesToPattern,
  countAmPmForAssignments,
} from './employeeAllocator';
import { scoreCoverageResult } from './humanRules';
import { classifyScheduleWeek } from './weekClassifier';
import type {
  BuildProposalOptions,
  ExternalSupportDraft,
  ScheduleNextInput,
  ScheduleNextProposal,
  ScheduleNextProposalRow,
} from './types';
import { BRIDGE_COMPENSATION_HOURS } from './types';

function proposalIdFor(weekStart: string, seed: number): string {
  return `next-${weekStart}-s${seed}`;
}

function supportSegmentsForGap(
  shift: string,
  periods: import('@/lib/schedule/generateSchedule/types').OperatingPeriod[],
  needAm: boolean,
  needPm: boolean,
  isRamadan: boolean
): ShiftSegment[] {
  const maxH = isRamadan ? 6 : 8;
  const normalized = shift.toUpperCase();
  if (normalized === 'SPLIT' || (needAm && needPm)) {
    if (periods.length >= 2) {
      return [
        segmentFromPeriodStart(periods[0], 0, maxH),
        segmentFromPeriodEnd(periods[1], 1, maxH),
      ];
    }
  }
  if (needPm && periods.length >= 2) {
    return [segmentFromPeriodEnd(periods[1], 1, maxH)];
  }
  if (needPm && periods.length === 1) {
    return [segmentFromPeriodEnd(periods[0], 0, maxH)];
  }
  if (needAm && periods.length) {
    return [segmentFromPeriodStart(periods[0], 0, maxH)];
  }
  return [];
}

function applyExternalSupport(
  row: ScheduleNextProposalRow,
  drafts: ExternalSupportDraft[],
  periods: import('@/lib/schedule/generateSchedule/types').OperatingPeriod[],
  dayOfWeek: number,
  isRamadan: boolean,
  isFridayPmOnly: boolean
): ScheduleNextProposalRow {
  const minAm = isFridayPmOnly ? 0 : 2;
  const minPm = 2;
  let amCount = row.amCount;
  let pmCount = row.pmCount;
  const external = [...row.externalCoverage];

  const dayDrafts = drafts.filter((d) => d.date === row.date);
  for (const draft of dayDrafts) {
    const needAm = amCount < minAm;
    const needPm = pmCount < minPm;
    if (!needAm && !needPm) break;

    let segments = draft.segments;
    if (!segments?.length) {
      segments = supportSegmentsForGap(draft.shift, periods, needAm, needPm, isRamadan);
    }
    if (!segments.length) continue;

    const { am, pm } = segmentsAmPmContribution(segments, periods, dayOfWeek, isRamadan);
    external.push({
      empId: draft.empId,
      name: draft.employeeName,
      kind: 'External',
      segments,
    });
    if (am) amCount++;
    if (pm) pmCount++;
  }

  return {
    ...row,
    externalCoverage: external,
    amCount,
    pmCount,
  };
}

function buildRows(
  input: ScheduleNextInput,
  allocation: ReturnType<typeof allocateEmployeesToPattern>
): ScheduleNextProposalRow[] {
  const ramadanRange = getRamadanRange();
  const opByDate = new Map(
    buildWeekOperatingConfigs(
      input.days.map((d) => d.date),
      ramadanRange
    ).map((d) => [d.date, d])
  );

  return input.days.map((day) => {
    const op = opByDate.get(day.date);
    const periods = op?.operatingPeriods ?? [];
    const assignments = allocation.dayAssignments.get(day.date) ?? [];

    const morning: ScheduleNextProposalRow['morning'] = [];
    const afternoon: ScheduleNextProposalRow['afternoon'] = [];

    for (const a of assignments) {
      const { am, pm } = segmentsAmPmContribution(
        a.segments,
        periods,
        day.dayOfWeek,
        day.isRamadan
      );
      const entry = {
        empId: a.empId,
        name: a.name,
        kind: a.kind,
        segments: a.segments,
        movedWeeklyOff: a.movedWeeklyOff,
      };
      if (am) morning.push(entry);
      if (pm) afternoon.push(entry);
    }

    const counts = countAmPmForAssignments(
      assignments,
      periods,
      day.dayOfWeek,
      day.isRamadan
    );

    return {
      date: day.date,
      dayName: day.dayName,
      dayOfWeek: day.dayOfWeek,
      morning,
      afternoon,
      externalCoverage: [],
      amCount: counts.amCount,
      pmCount: counts.pmCount,
      status: 'OK' as const,
    };
  });
}

function finalizeProposal(
  input: ScheduleNextInput,
  rows: ScheduleNextProposalRow[],
  allocation: ReturnType<typeof allocateEmployeesToPattern>,
  classification: ReturnType<typeof classifyScheduleWeek>,
  seed: number,
  gridRows?: import('@/lib/services/scheduleGrid').GridRow[]
): ScheduleNextProposal {
  const ramadanRange = getRamadanRange();
  const opByDate = new Map(
    buildWeekOperatingConfigs(
      input.days.map((d) => d.date),
      ramadanRange
    ).map((d) => [d.date, d])
  );

  const enrichedRows = rows.map((row) => {
    const day = input.days.find((d) => d.date === row.date)!;
    const op = opByDate.get(row.date);
    const periods = op?.operatingPeriods ?? [];
    const isFridayPmOnly = day.isFriday && !day.isRamadan;
    const r = applyExternalSupport(
      row,
      input.externalSupport,
      periods,
      day.dayOfWeek,
      day.isRamadan,
      isFridayPmOnly
    );
    const needsSupport =
      classification.weekType === 'IMPOSSIBLE_WITHOUT_SUPPORT' &&
      input.externalSupport.length === 0;
    return {
      ...r,
      status: rowStatusFromCoverage(r, classification.isRamadan, needsSupport),
    };
  });

  const coverage = checkProposalCoverage(enrichedRows, classification.isRamadan);
  const bridgeCount = Array.from(allocation.employeeStats.values()).reduce(
    (s, e) => s + e.bridgeCount,
    0
  );
  const compensationHours = bridgeCount * BRIDGE_COMPENSATION_HOURS;
  const weeklyOffMoves = allocation.weeklyOffMoves.length;

  const explanation: string[] = [];
  for (const m of allocation.weeklyOffMoves) {
    explanation.push(
      `WEEKLY_OFF_MOVE:${m.empId}|${m.fromDate}|${m.toDate}|${m.name}`
    );
    explanation.push(
      `Moved ${m.name} weekly off from ${m.fromDate} to ${m.toDate} for coverage`
    );
  }
  if (classification.weekType === 'CRITICAL_3_AVAILABLE') {
    explanation.push('Using AM + PM + Bridge pattern for 3 available staff');
  }
  if (input.externalSupport.length) {
    explanation.push('External support applied only to uncovered periods');
  }

  let status: ScheduleNextProposal['status'] = 'ACCEPTABLE';
  if (classification.weekType === 'IMPOSSIBLE_WITHOUT_SUPPORT' && !input.externalSupport.length) {
    status = 'NEEDS_SUPPORT';
  } else if (!coverage.valid) {
    status = 'INCOMPLETE';
  }

  const employeeSummary = Array.from(allocation.employeeStats.entries()).map(([empId, s]) => ({
    empId,
    name: s.name,
    totalHours: s.totalHours,
    bridgeCount: s.bridgeCount,
    compensationHours: s.compensationHours,
  }));

  const proposal: ScheduleNextProposal = {
    proposalId: proposalIdFor(input.weekStart, seed),
    weekStart: input.weekStart,
    status,
    rows: enrichedRows,
    weeklyOffMoves: allocation.weeklyOffMoves,
    summary: {
      coverageValid: coverage.valid,
      bridgeCount,
      compensationHours,
      overtimeHours: 0,
      externalSupportHours: input.externalSupport.length * 5,
      weeklyOffMoves,
    },
    employeeSummary,
    explanation,
    actions: [],
    weekType: classification.weekType,
  };

  if (gridRows) {
    proposal.actions = mergeProposalActions(proposal, gridRows);
  }

  return proposal;
}

export function buildScheduleNextProposal(
  input: ScheduleNextInput,
  options: BuildProposalOptions = {},
  gridRows?: import('@/lib/services/scheduleGrid').GridRow[]
): ScheduleNextProposal {
  const rejected = new Set(options.rejectedProposalIds ?? []);
  const baseSeed = options.seed ?? 0;

  const classification = classifyScheduleWeek(input);
  let best: ScheduleNextProposal | null = null;
  let bestScore = -Infinity;

  for (let attempt = 0; attempt < 10; attempt++) {
    const seed = baseSeed + attempt;
    const id = proposalIdFor(input.weekStart, seed);
    if (rejected.has(id)) continue;

    const allocation = allocateEmployeesToPattern(input, classification, { seed });
    const rows = buildRows(input, allocation);
    const proposal = finalizeProposal(
      input,
      rows,
      allocation,
      classification,
      seed,
      gridRows
    );

    const coverage = checkProposalCoverage(proposal.rows, classification.isRamadan);
    const score =
      scoreCoverageResult(coverage) +
      (proposal.status === 'ACCEPTABLE' ? 500 : 0) -
      proposal.summary.bridgeCount;

    if (score > bestScore) {
      bestScore = score;
      best = proposal;
    }
    if (proposal.status === 'ACCEPTABLE') {
      return proposal;
    }
  }

  return best!;
}
