/**
 * Generate schedule proposals for the editor review flow (no DB writes).
 */

import { createHash } from 'crypto';
import { getScheduleGridForWeek } from '@/lib/services/scheduleGrid';
import { loadFairnessContext, buildEmployeeFairness } from '@/lib/services/schedulePlannerFairness';
import { loadWeekGuestShifts, type GuestShiftInput } from '@/lib/services/schedulePlanGuests';
import { getRamadanRange } from '@/lib/time/ramadan';
import { buildGenerateScheduleInput } from '@/lib/schedule/generateSchedule/buildInput';
import { generateSchedule } from '@/lib/schedule/generateSchedule/engine';
import { generateResultToPlanActions } from '@/lib/schedule/generateSchedule/toPlanActions';
import type { DayOperatingConfig, GenerateScheduleInput, GenerateScheduleResult } from '@/lib/schedule/generateSchedule/types';
import type { PlanAction } from '@/lib/services/schedulePlanner';
import type { ScheduleGridResult } from '@/lib/services/scheduleGrid';
import {
  buildProposalDayRows,
  buildProposalSummary,
} from '@/lib/schedule/proposalPresenter';
import {
  evaluateProposalQuality,
  compareProposalQualityCandidates,
  type ProposalQualityResult,
} from '@/lib/schedule/proposalQualityGate';
import { buildWeeklyStrategy, type WorkforceWeeklyStrategy } from '@/lib/schedule/workforceStrategyAI';
import { weekDateStringsFromStart } from '@/lib/services/swapWeeklyOffForWeek';
import { getDowRiyadhFromYmd } from '@/lib/schedule/dayOverride';

export type ExternalCoverageInput = {
  empId: string;
  employeeName: string;
  date: string;
  shift: string;
  sourceBoutiqueId?: string;
  segments?: Array<{ startTime: string; endTime: string; periodIndex: number }>;
};

export type GenerateProposalInput = {
  weekStart: string;
  boutiqueIds: string[];
  externalCoverage?: ExternalCoverageInput[];
  rejectedProposalIds?: string[];
  strategySeed?: number;
};

type GeneratedProposalBase = {
  proposalId: string;
  proposalNumber: number;
  strategySeed: number;
  generateResult: GenerateScheduleResult;
  actions: PlanAction[];
  grid: ScheduleGridResult;
};

function bridgeFairnessPenalty(result: GenerateScheduleResult): number {
  const counts = result.employeeSummaries.map((e) => e.bridgeDays);
  if (counts.length <= 1) return 0;
  const max = Math.max(...counts);
  const min = Math.min(...counts);
  return max - min;
}

function evaluateGenerated(
  generated: GeneratedProposalBase,
  days: DayOperatingConfig[],
  labelAsIncomplete?: boolean
): ProposalQualityResult {
  const rows = buildProposalDayRows(
    days,
    generated.generateResult.assignments,
    generated.grid,
    generated.generateResult.slotViolations,
    generated.generateResult.weeklyOffVariant
  );
  const summary = buildProposalSummary(
    generated.generateResult,
    generated.grid,
    generated.generateResult.weeklyOffVariant
  );
  return evaluateProposalQuality(
    {
      rows,
      days,
      slotViolations: generated.generateResult.slotViolations,
      summary,
    },
    {},
    { labelAsIncomplete }
  );
}

function proposalSignature(result: GenerateScheduleResult): string {
  const parts = result.assignments
    .filter((a) => a.shiftKind !== 'Off' && a.shiftKind !== 'Leave')
    .map((a) => `${a.empId}|${a.date}|${a.shiftKind}|${a.segments.map((s) => `${s.startTime}-${s.endTime}`).join('+')}`)
    .sort();
  return createHash('sha256').update(parts.join(';')).digest('hex').slice(0, 16);
}

function mergeGuestShifts(
  persisted: GuestShiftInput[],
  draft: ExternalCoverageInput[] | undefined
): GuestShiftInput[] {
  if (!draft?.length) return persisted;
  const byKey = new Map(persisted.map((g) => [`${g.empId}|${g.date}`, g]));
  for (const d of draft) {
    byKey.set(`${d.empId}|${d.date}`, {
      empId: d.empId,
      employeeName: d.employeeName,
      date: d.date,
      shift: d.shift,
      sourceBoutiqueId: d.sourceBoutiqueId,
    });
  }
  return Array.from(byKey.values());
}

function weeklyOffSwapActions(
  grid: ScheduleGridResult,
  weeklyOffVariant: Record<string, number> | undefined,
  weekStart: string,
  fairnessScore: number
): PlanAction[] {
  if (!weeklyOffVariant || Object.keys(weeklyOffVariant).length === 0) return [];
  const weekDates = weekDateStringsFromStart(weekStart);
  const dateByDow = new Map(weekDates.map((d) => [getDowRiyadhFromYmd(d), d]));
  const actions: PlanAction[] = [];

  for (const row of grid.rows) {
    if (row.isGuest) continue;
    const baseOff = row.effectiveWeeklyOffDay;
    if (baseOff === 'NONE') continue;
    const variantOff = weeklyOffVariant[row.empId];
    if (variantOff === undefined || variantOff === baseOff) continue;

    const oldOffDate = dateByDow.get(baseOff as number);
    const newOffDate = dateByDow.get(variantOff);
    if (!oldOffDate || !newOffDate) continue;

    const oldCell = row.cells.find((c) => c.date === oldOffDate);
    const newCell = row.cells.find((c) => c.date === newOffDate);
    const dayIndexOld = row.cells.findIndex((c) => c.date === oldOffDate);
    const dayIndexNew = row.cells.findIndex((c) => c.date === newOffDate);

    actions.push({
      id: `wo-fw-${row.empId}-${oldOffDate}`,
      type: 'FORCE_WORK',
      date: oldOffDate,
      dayIndex: dayIndexOld >= 0 ? dayIndexOld : 0,
      empId: row.empId,
      employeeName: row.name,
      fromShift: oldCell?.availability === 'WORK' ? oldCell.effectiveShift : 'NONE',
      toShift: 'MORNING',
      reason: 'Proposal: weekly off moved for this week',
      fairnessScore,
    });

    const assignmentOnNewOff = actions.find((a) => a.empId === row.empId && a.date === newOffDate);
    if (!assignmentOnNewOff && newCell?.availability === 'WORK') {
      actions.push({
        id: `wo-off-${row.empId}-${newOffDate}`,
        type: 'SHIFT_CHANGE',
        date: newOffDate,
        dayIndex: dayIndexNew >= 0 ? dayIndexNew : 0,
        empId: row.empId,
        employeeName: row.name,
        fromShift: newCell.effectiveShift,
        toShift: 'NONE',
        reason: 'Proposal: temporary weekly off',
        fairnessScore,
      });
    }
  }

  return actions;
}

export type ProposalEngineContext = {
  grid: ScheduleGridResult;
  engineInput: GenerateScheduleInput;
  weeklyStrategy: WorkforceWeeklyStrategy;
};

/** Load grid + engine input + workforce strategy for proposal flow. */
export async function loadProposalEngineContext(
  input: GenerateProposalInput
): Promise<ProposalEngineContext> {
  const grid = await getScheduleGridForWeek(input.weekStart, { boutiqueIds: input.boutiqueIds });
  const empIds = grid.rows.map((r) => r.empId);
  const ramadanRange = getRamadanRange();

  const [fairnessContext, persistedGuests] = await Promise.all([
    loadFairnessContext(input.weekStart, empIds),
    loadWeekGuestShifts(input.weekStart, input.boutiqueIds),
  ]);
  const guestShifts = mergeGuestShifts(persistedGuests, input.externalCoverage);
  const fairnessRows = buildEmployeeFairness(grid.rows, fairnessContext);

  const engineInput = buildGenerateScheduleInput(grid, {
    guestShifts,
    fairnessRows,
    ramadanRange,
    preserveExisting: false,
  });

  const weeklyStrategy = buildWeeklyStrategy(engineInput);

  return { grid, engineInput, weeklyStrategy };
}

async function runOnce(
  input: GenerateProposalInput,
  strategySeed: number,
  ctx: ProposalEngineContext
): Promise<GeneratedProposalBase> {
  const { grid, engineInput, weeklyStrategy } = ctx;
  const exec = weeklyStrategy.execution;
  const rotation = strategySeed + (exec.allowWeeklyOffMove ? exec.scenarioRotation : 0);
  const bridgeOffset = exec.allowBridge ? strategySeed + exec.bridgeRotationOffset : strategySeed;

  const generateResult = generateSchedule(engineInput, {
    forcePartialSolve: true,
    preAnalyzed: true,
    scenarioRotation: rotation,
    bridgeRotationOffset: bridgeOffset,
  });

  const shiftActions = generateResultToPlanActions(generateResult, grid.rows);
  const offActions = weeklyOffSwapActions(
    grid,
    generateResult.weeklyOffVariant,
    input.weekStart,
    generateResult.fairnessScore
  );
  const actions = [...offActions, ...shiftActions];

  const proposalId = proposalSignature(generateResult);

  return {
    proposalId,
    proposalNumber: strategySeed + 1,
    strategySeed,
    generateResult,
    actions,
    grid,
  };
}

export type GenerateProposalResult = GeneratedProposalBase & {
  quality: ProposalQualityResult;
  weeklyStrategy: WorkforceWeeklyStrategy;
};

const MAX_STRATEGY_ATTEMPTS = 12;
const MAX_QUALITY_ATTEMPTS = 5;

/** Generate a proposal that passes the quality gate, or return the best achievable incomplete option. */
export async function generateScheduleProposal(
  input: GenerateProposalInput,
  days: DayOperatingConfig[]
): Promise<GenerateProposalResult> {
  const ctx = await loadProposalEngineContext(input);
  const rejected = new Set(input.rejectedProposalIds ?? []);
  const startSeed = input.strategySeed ?? 0;
  const failedCandidates: Array<{
    base: GeneratedProposalBase;
    quality: ProposalQualityResult;
    summary: ReturnType<typeof buildProposalSummary>;
    bridgeFairnessPenalty: number;
  }> = [];

  let qualityAttempts = 0;
  for (let attempt = 0; attempt < MAX_STRATEGY_ATTEMPTS && qualityAttempts < MAX_QUALITY_ATTEMPTS; attempt++) {
    const strategySeed = startSeed + attempt;
    const base = await runOnce(input, strategySeed, ctx);
    if (rejected.has(base.proposalId)) continue;

    qualityAttempts += 1;
    const quality = evaluateGenerated(base, days);
    if (quality.acceptable) {
      return { ...base, quality: { ...quality, status: 'ACCEPTABLE' }, weeklyStrategy: ctx.weeklyStrategy };
    }

    rejected.add(base.proposalId);
    const summary = buildProposalSummary(
      base.generateResult,
      base.grid,
      base.generateResult.weeklyOffVariant
    );
    failedCandidates.push({
      base,
      quality,
      summary,
      bridgeFairnessPenalty: bridgeFairnessPenalty(base.generateResult),
    });
  }

  if (failedCandidates.length > 0) {
    failedCandidates.sort((a, b) =>
      compareProposalQualityCandidates(
        {
          quality: a.quality,
          summary: a.summary,
          bridgeFairnessPenalty: a.bridgeFairnessPenalty,
        },
        {
          quality: b.quality,
          summary: b.summary,
          bridgeFairnessPenalty: b.bridgeFairnessPenalty,
        }
      )
    );
    const best = failedCandidates[0]!;
    const incompleteQuality = evaluateGenerated(best.base, days, true);
    return { ...best.base, quality: incompleteQuality, weeklyStrategy: ctx.weeklyStrategy };
  }

  for (let attempt = qualityAttempts; attempt < MAX_STRATEGY_ATTEMPTS; attempt++) {
    const strategySeed = startSeed + attempt;
    const base = await runOnce(input, strategySeed, ctx);
    if (rejected.has(base.proposalId)) continue;
    const quality = evaluateGenerated(base, days, true);
    return { ...base, quality, weeklyStrategy: ctx.weeklyStrategy };
  }

  const fallback = await runOnce(input, startSeed + MAX_STRATEGY_ATTEMPTS, ctx);
  const quality = evaluateGenerated(fallback, days, true);
  return { ...fallback, proposalId: `${fallback.proposalId}-alt`, quality, weeklyStrategy: ctx.weeklyStrategy };
}
