/**
 * Proposal review quality gate — operational minimums before showing a schedule to managers.
 * Does not block manual editor changes; only governs proposed schedule review.
 */

import {
  effectiveMinAm,
  effectiveMinPm,
  evaluateCoverage,
} from '@/lib/schedule/coveragePolicy';
import type { DayOperatingConfig, SlotViolation } from '@/lib/schedule/generateSchedule/types';
import type { ProposalDayRow, ProposalSummary } from '@/lib/schedule/proposalPresenter';
import { formatSlotViolationMessage } from '@/lib/schedule/timeCoverageValidation';

export type ProposalQualityStatus = 'ACCEPTABLE' | 'INCOMPLETE' | 'REJECTED';

export type ProposalBlockingIssue = {
  date: string;
  dayName: string;
  type: string;
  message: string;
  amCount: number;
  pmCount: number;
  requiredAm: number;
  requiredPm: number;
};

export type ProposalQualityPolicy = {
  ruleMinAm?: number;
  ruleMinPm?: number;
};

export type ProposalQualityInput = {
  rows: ProposalDayRow[];
  days: DayOperatingConfig[];
  slotViolations: SlotViolation[];
  summary: ProposalSummary;
};

export type ProposalQualityResult = {
  acceptable: boolean;
  status: ProposalQualityStatus;
  score: number;
  blockingIssues: ProposalBlockingIssue[];
  warnings: string[];
  reason: string;
  recommendedAction: string;
};

function dayConfigByDate(days: DayOperatingConfig[]): Map<string, DayOperatingConfig> {
  return new Map(days.map((d) => [d.date, d]));
}

function violationsForDate(violations: SlotViolation[], date: string): SlotViolation[] {
  return violations.filter((v) => v.date === date);
}

function bucketIssuesForDay(
  row: ProposalDayRow,
  day: DayOperatingConfig,
  policy: ProposalQualityPolicy
): ProposalBlockingIssue[] {
  const ruleMinAm = policy.ruleMinAm ?? 0;
  const ruleMinPm = policy.ruleMinPm ?? 0;
  const requiredAm = effectiveMinAm(day.dayOfWeek, ruleMinAm);
  const requiredPm = effectiveMinPm(day.dayOfWeek, ruleMinPm);
  const coverageIssues = evaluateCoverage(
    { am: row.amCount, pm: row.pmCount },
    day.dayOfWeek,
    ruleMinAm,
    ruleMinPm
  );

  return coverageIssues.map((issue) => ({
    date: row.date,
    dayName: row.dayName,
    type: issue.type,
    message: issue.message,
    amCount: row.amCount,
    pmCount: row.pmCount,
    requiredAm,
    requiredPm,
  }));
}

function slotIssuesForDay(row: ProposalDayRow, violations: SlotViolation[]): ProposalBlockingIssue[] {
  return violations.map((v) => ({
    date: row.date,
    dayName: row.dayName,
    type: 'SLOT_COVERAGE',
    message: formatSlotViolationMessage(v),
    amCount: row.amCount,
    pmCount: row.pmCount,
    requiredAm: 0,
    requiredPm: 0,
  }));
}

function computeScore(blockingIssues: ProposalBlockingIssue[], warnings: string[]): number {
  let score = 100;
  score -= blockingIssues.length * 12;
  score -= warnings.length * 4;
  return Math.max(0, Math.min(100, score));
}

function buildReason(blockingIssues: ProposalBlockingIssue[], acceptable: boolean): string {
  if (acceptable) return 'Meets minimum operational coverage for all days.';
  const days = Array.from(new Set(blockingIssues.map((i) => i.dayName)));
  if (days.length === 1) {
    return `Coverage requirements not met on ${days[0]}.`;
  }
  return `Coverage requirements not met on ${days.slice(0, 3).join(', ')}${days.length > 3 ? ` and ${days.length - 3} more` : ''}.`;
}

function buildRecommendedAction(
  blockingIssues: ProposalBlockingIssue[],
  acceptable: boolean,
  summary: ProposalSummary
): string {
  if (acceptable) return 'Review and approve, or regenerate for an alternative.';
  const hasSlot = blockingIssues.some((i) => i.type === 'SLOT_COVERAGE');
  const hasPm = blockingIssues.some((i) => i.type === 'PM_BELOW_MIN' || i.type === 'PM_NOT_ABOVE_AM');
  const hasAm = blockingIssues.some((i) => i.type === 'AM_BELOW_MIN' || i.type === 'AM_ON_FRIDAY');
  if (summary.externalSupportHours === 0 && (hasAm || hasPm)) {
    return 'Regenerate with a different strategy, add external support, or apply as best achievable and fix manually.';
  }
  if (hasSlot) {
    return 'Regenerate, adjust operating coverage, or apply as best achievable and fill gaps manually.';
  }
  if (summary.bridgeCount > 0 && hasPm) {
    return 'Regenerate with a different bridge rotation or apply and adjust PM coverage manually.';
  }
  return 'Regenerate another proposal or apply as best achievable and edit shifts manually.';
}

export function evaluateProposalQuality(
  proposal: ProposalQualityInput,
  policy: ProposalQualityPolicy = {},
  options?: { labelAsIncomplete?: boolean }
): ProposalQualityResult {
  const dayByDate = dayConfigByDate(proposal.days);
  const blockingIssues: ProposalBlockingIssue[] = [];
  const warnings: string[] = [];

  for (const row of proposal.rows) {
    const day = dayByDate.get(row.date);
    if (!day) continue;

    if (day.isRamadan) {
      const dayViolations = violationsForDate(proposal.slotViolations, row.date);
      if (dayViolations.length > 0) {
        blockingIssues.push(...slotIssuesForDay(row, dayViolations));
      }
      continue;
    }

    blockingIssues.push(...bucketIssuesForDay(row, day, policy));
  }

  if (!blockingIssues.length && proposal.summary.overtimeHours > 12) {
    warnings.push(`High overtime (${proposal.summary.overtimeHours}h) in this proposal.`);
  }

  const acceptable = blockingIssues.length === 0;
  const status: ProposalQualityStatus = acceptable
    ? 'ACCEPTABLE'
    : options?.labelAsIncomplete
      ? 'INCOMPLETE'
      : 'REJECTED';

  return {
    acceptable,
    status,
    score: computeScore(blockingIssues, warnings),
    blockingIssues,
    warnings,
    reason: buildReason(blockingIssues, acceptable),
    recommendedAction: buildRecommendedAction(blockingIssues, acceptable, proposal.summary),
  };
}

export type ProposalQualityCandidate = {
  quality: ProposalQualityResult;
  summary: ProposalSummary;
  bridgeFairnessPenalty?: number;
};

/** Prefer fewer issues, higher score, fewer bridges, less OT, fairer bridge spread. */
export function compareProposalQualityCandidates(a: ProposalQualityCandidate, b: ProposalQualityCandidate): number {
  if (a.quality.blockingIssues.length !== b.quality.blockingIssues.length) {
    return a.quality.blockingIssues.length - b.quality.blockingIssues.length;
  }
  if (a.quality.score !== b.quality.score) {
    return b.quality.score - a.quality.score;
  }
  if (a.summary.bridgeCount !== b.summary.bridgeCount) {
    return a.summary.bridgeCount - b.summary.bridgeCount;
  }
  if (a.summary.overtimeHours !== b.summary.overtimeHours) {
    return a.summary.overtimeHours - b.summary.overtimeHours;
  }
  const af = a.bridgeFairnessPenalty ?? 0;
  const bf = b.bridgeFairnessPenalty ?? 0;
  return af - bf;
}

export type ProposalRowIssuePill = 'Needs AM' | 'Needs PM' | 'Incomplete';

export function issuePillsForProposalRow(
  row: ProposalDayRow,
  blockingIssues: ProposalBlockingIssue[]
): ProposalRowIssuePill[] {
  const dayIssues = blockingIssues.filter((i) => i.date === row.date);
  if (!dayIssues.length) return [];

  const pills = new Set<ProposalRowIssuePill>();
  for (const issue of dayIssues) {
    if (issue.type === 'AM_BELOW_MIN' || issue.type === 'AM_ON_FRIDAY') {
      pills.add('Needs AM');
    } else if (issue.type === 'PM_BELOW_MIN' || issue.type === 'PM_NOT_ABOVE_AM') {
      pills.add('Needs PM');
    } else if (issue.type === 'SLOT_COVERAGE') {
      pills.add('Incomplete');
    }
  }
  if (!pills.size && dayIssues.length > 0) {
    pills.add('Incomplete');
  }
  return Array.from(pills);
}

export function rowBelowRequiredCoverage(
  row: ProposalDayRow,
  blockingIssues: ProposalBlockingIssue[]
): boolean {
  return blockingIssues.some((i) => i.date === row.date);
}

export function proposalReviewTitleKey(status: ProposalQualityStatus): string {
  if (status === 'INCOMPLETE') return 'schedule.proposal.titleIncomplete';
  return 'schedule.proposal.title';
}

export function shouldShowIncompleteProposalBanner(status: ProposalQualityStatus): boolean {
  return status === 'INCOMPLETE';
}
