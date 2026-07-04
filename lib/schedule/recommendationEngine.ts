/**
 * Smart Recommendation Engine — specific, ranked fixes for IMPOSSIBLE / NEEDS_SUPPORT weeks.
 */

import type { ConstraintAnalysisResult } from '@/lib/schedule/constraintAnalyzer';
import { buildDaySlotBundles, parseTimeToMinutes } from '@/lib/schedule/generateSchedule/timeSlots';
import { getSchedulePolicy } from '@/lib/schedule/policyEngine';
import type {
  EmployeeCandidate,
  GenerateScheduleInput,
  GenerateScheduleResult,
  SlotViolation,
  Unavailability,
} from '@/lib/schedule/generateSchedule/types';

export type SmartRecommendationType =
  | 'ADD_EXTERNAL_SUPPORT'
  | 'MOVE_WEEKLY_OFF'
  | 'ALLOW_OVERTIME'
  | 'REDUCE_MIN_COVERAGE'
  | 'APPROVE_PARTIAL'
  | 'ADJUST_LEAVE'
  | 'ALLOW_EXTRA_SPLIT';

export type SmartRecommendationImpact = 'high' | 'medium' | 'low';
export type SmartRecommendationCost = 'low' | 'medium' | 'high';
export type SmartFairnessImpact = 'better' | 'neutral' | 'worse';

export type AffectedTimeRange = {
  date: string;
  startTime: string;
  endTime: string;
  dayOfWeek: number;
};

export type SmartRecommendation = {
  id: string;
  type: SmartRecommendationType;
  /** Specific action title shown in UI. */
  title: string;
  impact: SmartRecommendationImpact;
  /** Estimated coverage health after applying (0–100). */
  coverageAfterPercent: number;
  cost: SmartRecommendationCost;
  fairnessImpact: SmartFairnessImpact;
  requiredAction: string;
  affectedDays: string[];
  affectedTimeRanges: AffectedTimeRange[];
  slotViolationsResolved: number;
  explanation: string;
  rank: number;
};

export type RecommendationEngineInput = {
  input: GenerateScheduleInput;
  analysis: ConstraintAnalysisResult;
  solverResult?: Pick<
    GenerateScheduleResult,
    'slotViolations' | 'coverageValid' | 'fairnessScore' | 'employeeSummaries' | 'assignments'
  >;
};

const DOW_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const TYPE_RANK: Record<SmartRecommendationType, number> = {
  ADD_EXTERNAL_SUPPORT: 1,
  ALLOW_OVERTIME: 2,
  MOVE_WEEKLY_OFF: 3,
  ALLOW_EXTRA_SPLIT: 4,
  REDUCE_MIN_COVERAGE: 5,
  ADJUST_LEAVE: 6,
  APPROVE_PARTIAL: 7,
};

function unavailKey(empId: string, date: string): string {
  return `${empId}|${date}`;
}

function buildUnavailMap(unavailability: Unavailability[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const u of unavailability) {
    map.set(unavailKey(u.empId, u.date), u.kind);
  }
  return map;
}

function isEmployeeAvailable(
  emp: EmployeeCandidate,
  date: string,
  dayOfWeek: number,
  unavail: Map<string, string>
): boolean {
  const kind = unavail.get(unavailKey(emp.empId, date));
  if (kind === 'leave' || kind === 'holiday' || kind === 'absent' || kind === 'weekly_off') {
    return false;
  }
  if (emp.weeklyOffDay !== 'NONE' && emp.weeklyOffDay === dayOfWeek) return false;
  return true;
}

function dayName(dayOfWeek: number): string {
  return DOW_NAMES[dayOfWeek] ?? `Day ${dayOfWeek}`;
}

function mergeViolationsToRanges(
  violations: SlotViolation[],
  days: GenerateScheduleInput['days']
): AffectedTimeRange[] {
  if (!violations.length) return [];

  const byDate = new Map<string, SlotViolation[]>();
  for (const v of violations) {
    byDate.set(v.date, [...(byDate.get(v.date) ?? []), v]);
  }

  const ranges: AffectedTimeRange[] = [];
  for (const [date, dayViolations] of Array.from(byDate.entries())) {
    const day = days.find((d) => d.date === date);
    const dayOfWeek = day?.dayOfWeek ?? new Date(`${date}T12:00:00Z`).getUTCDay();
    const sorted = [...dayViolations].sort(
      (a, b) => parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime)
    );

    let rangeStart = sorted[0].startTime;
    let rangeEnd = sorted[0].endTime;
    for (let i = 1; i < sorted.length; i++) {
      const v = sorted[i];
      const prevEnd = parseTimeToMinutes(rangeEnd);
      const nextStart = parseTimeToMinutes(v.startTime);
      if (nextStart <= prevEnd + 30) {
        if (parseTimeToMinutes(v.endTime) > prevEnd) rangeEnd = v.endTime;
      } else {
        ranges.push({ date, startTime: rangeStart, endTime: rangeEnd, dayOfWeek });
        rangeStart = v.startTime;
        rangeEnd = v.endTime;
      }
    }
    ranges.push({ date, startTime: rangeStart, endTime: rangeEnd, dayOfWeek });
  }

  return ranges.sort((a, b) => a.date.localeCompare(b.date));
}

function worstDayByViolations(violations: SlotViolation[]): string | null {
  const counts = new Map<string, number>();
  for (const v of violations) {
    counts.set(v.date, (counts.get(v.date) ?? 0) + 1);
  }
  let worst: string | null = null;
  let max = 0;
  for (const [date, count] of Array.from(counts.entries())) {
    if (count > max) {
      max = count;
      worst = date;
    }
  }
  return worst;
}

function coveragePercent(violationCount: number, totalSlots: number): number {
  if (totalSlots <= 0) return 100;
  return Math.max(0, Math.min(100, Math.round(100 - (violationCount / totalSlots) * 100)));
}

function slotsResolvedIfHeadcountAdded(
  violations: SlotViolation[],
  date: string
): number {
  return violations.filter((v) => v.date === date && v.coverage + 1 >= v.minCoverage).length;
}

function findWeeklyOffMoveCandidate(
  input: GenerateScheduleInput,
  criticalDate: string,
  unavail: Map<string, string>
): { emp: EmployeeCandidate; fromDow: number; toDow: number } | null {
  const day = input.days.find((d) => d.date === criticalDate);
  if (!day) return null;

  const candidates = input.regularEmployees.filter(
    (emp) => emp.weeklyOffDay !== 'NONE' && emp.weeklyOffDay === day.dayOfWeek
  );
  if (!candidates.length) return null;

  let bestTargetDow = -1;
  let bestTargetScore = -1;
  for (const d of input.days) {
    if (d.dayOfWeek === day.dayOfWeek) continue;
    const available = input.regularEmployees.filter((emp) =>
      isEmployeeAvailable(emp, d.date, d.dayOfWeek, unavail)
    ).length;
    if (available > bestTargetScore) {
      bestTargetScore = available;
      bestTargetDow = d.dayOfWeek;
    }
  }
  if (bestTargetDow < 0) return null;

  const emp = candidates[0];
  return { emp, fromDow: day.dayOfWeek, toDow: bestTargetDow };
}

function findOvertimeCandidate(
  input: GenerateScheduleInput,
  date: string,
  unavail: Map<string, string>,
  summaries?: GenerateScheduleResult['employeeSummaries']
): EmployeeCandidate | null {
  const day = input.days.find((d) => d.date === date);
  if (!day) return null;

  const available = input.regularEmployees.filter((emp) =>
    isEmployeeAvailable(emp, date, day.dayOfWeek, unavail)
  );
  if (!available.length) return null;

  const hoursByEmp = new Map(summaries?.map((s) => [s.empId, s.totalHours]) ?? []);
  return [...available].sort(
    (a, b) => (hoursByEmp.get(a.empId) ?? 0) - (hoursByEmp.get(b.empId) ?? 0)
  )[0];
}

function lateViolations(violations: SlotViolation[], afterMinutes = 21 * 60 + 30): SlotViolation[] {
  return violations.filter((v) => parseTimeToMinutes(v.startTime) >= afterMinutes);
}

function makeId(type: SmartRecommendationType, suffix: string): string {
  return `${type}-${suffix}`;
}

/** Generate specific ranked recommendations (top 3 returned by default). */
export function generateSmartRecommendations(
  ctx: RecommendationEngineInput,
  limit = 3
): SmartRecommendation[] {
  const { input, analysis, solverResult } = ctx;
  const policy = getSchedulePolicy(input);
  const unavail = buildUnavailMap(input.unavailability);
  const interval = input.settings.slotIntervalMinutes;
  const bundles = buildDaySlotBundles(input.days, interval);
  const totalSlots = bundles.reduce((sum, b) => sum + b.slots.length, 0);

  const violations = solverResult?.slotViolations?.length
    ? solverResult.slotViolations
    : synthesizeViolationsFromAnalysis(input, analysis);

  const violationCount = violations.length;
  const currentCoveragePercent = coveragePercent(violationCount, totalSlots);
  const mergedRanges = mergeViolationsToRanges(violations, input.days);

  if (analysis.status === 'FEASIBLE' && violationCount === 0) {
    return [];
  }

  const recs: SmartRecommendation[] = [];

  // --- External support (specific day + time range) ---
  if (policy.externalSupport.allowed && analysis.insights.externalSupportWouldHelp) {
    const worstDate =
      worstDayByViolations(violations) ??
      analysis.impossibleDays[0] ??
      analysis.issues.find((i) => i.date)?.date ??
      input.days[0]?.date;

    if (worstDate) {
      const day = input.days.find((d) => d.date === worstDate);
      const dayViolations = violations.filter((v) => v.date === worstDate);
      const range =
        mergedRanges.find((r) => r.date === worstDate) ??
        ({
          date: worstDate,
          startTime: day?.operatingPeriods[0]?.startTime ?? '09:30',
          endTime: day?.operatingPeriods[day.operatingPeriods.length - 1]?.endTime ?? '22:30',
          dayOfWeek: day?.dayOfWeek ?? 0,
        } satisfies AffectedTimeRange);

      const resolved = dayViolations.length
        ? slotsResolvedIfHeadcountAdded(violations, worstDate)
        : Math.ceil(
            (analysis.issues.find((i) => i.date === worstDate)?.missing ?? 1) *
              (interval / 60) *
              2
          );

      recs.push({
        id: makeId('ADD_EXTERNAL_SUPPORT', worstDate),
        type: 'ADD_EXTERNAL_SUPPORT',
        title: `Add external support on ${dayName(range.dayOfWeek)} from ${range.startTime} to ${range.endTime}`,
        impact: 'high',
        coverageAfterPercent: coveragePercent(
          Math.max(0, violationCount - Math.max(resolved, dayViolations.length || 4)),
          totalSlots
        ),
        cost: 'high',
        fairnessImpact: 'better',
        requiredAction: 'Schedule Editor → Add External Coverage → pick source branch and employee for this shift block.',
        affectedDays: [worstDate],
        affectedTimeRanges: [range],
        slotViolationsResolved: Math.max(resolved, dayViolations.length > 0 ? dayViolations.length : 4),
        explanation: `Peak coverage on ${dayName(range.dayOfWeek)} needs at least 2 staff during ${range.startTime}–${range.endTime}; regular roster is short.`,
        rank: TYPE_RANK.ADD_EXTERNAL_SUPPORT,
      });
    }
  }

  // --- Move weekly off ---
  if (analysis.insights.moveWeeklyOffCouldHelp) {
    const conflictDay =
      analysis.issues.find((i) => i.type === 'WEEKLY_OFF_CONFLICT' && i.date)?.date ??
      analysis.impossibleDays[0] ??
      null;

    if (conflictDay) {
      const move = findWeeklyOffMoveCandidate(input, conflictDay, unavail);
      if (move) {
        const dayViolations = violations.filter((v) => v.date === conflictDay);
        const resolved = slotsResolvedIfHeadcountAdded(violations, conflictDay) || dayViolations.length;

        recs.push({
          id: makeId('MOVE_WEEKLY_OFF', move.emp.empId),
          type: 'MOVE_WEEKLY_OFF',
          title: `Move ${move.emp.name} weekly off from ${dayName(move.fromDow)} to ${dayName(move.toDow)}`,
          impact: 'medium',
          coverageAfterPercent: coveragePercent(
            Math.max(0, violationCount - resolved),
            totalSlots
          ),
          cost: 'low',
          fairnessImpact: 'neutral',
          requiredAction: `Schedule Editor → change ${move.emp.name}'s weekly off day to ${dayName(move.toDow)}.`,
          affectedDays: [conflictDay],
          affectedTimeRanges: mergedRanges.filter((r) => r.date === conflictDay),
          slotViolationsResolved: resolved,
          explanation: `${move.emp.name} is off on ${dayName(move.fromDow)} when coverage is critical; ${dayName(move.toDow)} has more capacity.`,
          rank: TYPE_RANK.MOVE_WEEKLY_OFF,
        });
      }
    }
  }

  // --- Overtime (specific employee + evening block) ---
  if (policy.overtime.allowed && analysis.insights.overtimeCouldHelp) {
    const hoursIssue = analysis.issues.find(
      (i) => i.type === 'OVERTIME_REQUIRED' || i.type === 'STAFF_HOURS_SHORTAGE'
    );
    const otDate = hoursIssue?.date ?? worstDayByViolations(violations);
    if (otDate) {
      const dayViolations = violations.filter((v) => v.date === otDate);
      const evening = dayViolations.filter(
        (v) => parseTimeToMinutes(v.startTime) >= 16 * 60
      );
      const rangeSource = evening.length ? evening : dayViolations;
      const startTime = rangeSource[0]?.startTime ?? '20:30';
      const endTime = rangeSource[rangeSource.length - 1]?.endTime ?? '22:30';
      const day = input.days.find((d) => d.date === otDate);
      const emp = findOvertimeCandidate(
        input,
        otDate,
        unavail,
        solverResult?.employeeSummaries
      );

      if (emp && day) {
        recs.push({
          id: makeId('ALLOW_OVERTIME', `${emp.empId}-${otDate}`),
          type: 'ALLOW_OVERTIME',
          title: `Allow ${emp.name} overtime on ${dayName(day.dayOfWeek)} ${startTime}–${endTime}`,
          impact: 'medium',
          coverageAfterPercent: coveragePercent(
            Math.max(0, violationCount - Math.min(evening.length || 2, 6)),
            totalSlots
          ),
          cost: 'medium',
          fairnessImpact: 'worse',
          requiredAction: `Extend ${emp.name}'s shift on ${otDate} beyond the ${day.isRamadan ? policy.maxDailyHours : 8}h daily cap (manager approval).`,
          affectedDays: [otDate],
          affectedTimeRanges: [
            { date: otDate, startTime, endTime, dayOfWeek: day.dayOfWeek },
          ],
          slotViolationsResolved: Math.min(evening.length || 2, 6),
          explanation: `Shortfall of ${hoursIssue?.missing ?? '?'} staff-hours on ${dayName(day.dayOfWeek)}; ${emp.name} has the lightest load this week among available staff.`,
          rank: TYPE_RANK.ALLOW_OVERTIME,
        });
      }
    }
  }

  // --- Reduce late minCoverage ---
  if (analysis.insights.reduceLateCoverageCouldHelp) {
    const late = lateViolations(violations);
    if (late.length) {
      const byDate = new Map<string, SlotViolation[]>();
      for (const v of late) {
        byDate.set(v.date, [...(byDate.get(v.date) ?? []), v]);
      }
      const [date, dayLate] = Array.from(byDate.entries()).sort(
        (a, b) => b[1].length - a[1].length
      )[0];
      const day = input.days.find((d) => d.date === date);
      const startTime = dayLate[0].startTime;
      const minCov = dayLate[0].minCoverage;

      recs.push({
        id: makeId('REDUCE_MIN_COVERAGE', date),
        type: 'REDUCE_MIN_COVERAGE',
        title: `Reduce minCoverage from ${minCov} to ${Math.max(1, minCov - 1)} after ${startTime} only`,
        impact: 'low',
        coverageAfterPercent: coveragePercent(
          Math.max(0, violationCount - dayLate.length),
          totalSlots
        ),
        cost: 'low',
        fairnessImpact: 'neutral',
        requiredAction: 'Adjust operating period minCoverage in policy/settings for late slots only (manager sign-off).',
        affectedDays: [date],
        affectedTimeRanges: [
          {
            date,
            startTime,
            endTime: dayLate[dayLate.length - 1].endTime,
            dayOfWeek: day?.dayOfWeek ?? 0,
          },
        ],
        slotViolationsResolved: dayLate.length,
        explanation: `${dayLate.length} late slot(s) on ${dayName(day?.dayOfWeek ?? 0)} fail with current minCoverage ${minCov}; lowering by 1 after ${startTime} matches available staff.`,
        rank: TYPE_RANK.REDUCE_MIN_COVERAGE,
      });
    }
  }

  // --- Adjust leave ---
  if (analysis.insights.leaveIsMainBlocker) {
    const leaveIssue = analysis.issues.find((i) => i.type === 'LEAVE_OVERLOAD' && i.date);
    if (leaveIssue?.date) {
      const day = input.days.find((d) => d.date === leaveIssue.date);
      recs.push({
        id: makeId('ADJUST_LEAVE', leaveIssue.date),
        type: 'ADJUST_LEAVE',
        title: `Cancel or move approved leave on ${dayName(day?.dayOfWeek ?? 0)} (${leaveIssue.date})`,
        impact: 'high',
        coverageAfterPercent: coveragePercent(
          Math.max(0, violationCount - (violations.filter((v) => v.date === leaveIssue.date).length || 8)),
          totalSlots
        ),
        cost: 'medium',
        fairnessImpact: 'worse',
        requiredAction: 'Leaves → review approvals for this date or swap with another team member.',
        affectedDays: [leaveIssue.date],
        affectedTimeRanges: mergedRanges.filter((r) => r.date === leaveIssue.date),
        slotViolationsResolved: violations.filter((v) => v.date === leaveIssue.date).length || 8,
        explanation: 'All regular employees are unavailable due to leave on this day.',
        rank: TYPE_RANK.ADJUST_LEAVE,
      });
    }
  }

  // --- Approve partial (post-solve with gaps) ---
  if (
    solverResult &&
    !solverResult.coverageValid &&
    violationCount > 0
  ) {
    const gapSummary = mergedRanges
      .slice(0, 3)
      .map((r) => `${dayName(r.dayOfWeek)} ${r.startTime}–${r.endTime}`)
      .join('; ');

    recs.push({
      id: makeId('APPROVE_PARTIAL', input.weekStart),
      type: 'APPROVE_PARTIAL',
      title: `Approve partial schedule — ${violationCount} slot(s) still below minimum`,
      impact: 'medium',
      coverageAfterPercent: currentCoveragePercent,
      cost: 'medium',
      fairnessImpact: 'neutral',
      requiredAction:
        'Apply only if partial coverage is acceptable; remaining gaps must be filled manually or via external support.',
      affectedDays: Array.from(new Set(violations.map((v) => v.date))).sort(),
      affectedTimeRanges: mergedRanges.slice(0, 5),
      slotViolationsResolved: 0,
      explanation: `Best-effort solver left gaps at: ${gapSummary}${mergedRanges.length > 3 ? '…' : ''}. Fairness score ${Math.round(solverResult.fairnessScore)} (internal).`,
      rank: TYPE_RANK.APPROVE_PARTIAL,
    });
  }

  // --- Extra split (Ramadan / multi-period) ---
  const splitIssue = analysis.issues.find((i) => i.type === 'SPLIT_SHIFT_REQUIRED' && i.date);
  if (splitIssue?.date && policy.split.allowed) {
    const day = input.days.find((d) => d.date === splitIssue.date);
    if (day && day.operatingPeriods.length > 1) {
      recs.push({
        id: makeId('ALLOW_EXTRA_SPLIT', splitIssue.date),
        type: 'ALLOW_EXTRA_SPLIT',
        title: `Allow split shift on ${dayName(day.dayOfWeek)} across ${day.operatingPeriods.map((p) => `${p.startTime}–${p.endTime}`).join(' + ')}`,
        impact: 'medium',
        coverageAfterPercent: coveragePercent(
          Math.max(0, violationCount - 2),
          totalSlots
        ),
        cost: 'low',
        fairnessImpact: 'neutral',
        requiredAction: `Enable split for one employee on ${splitIssue.date} (max ${policy.split.maxDaysPerEmployeePerWeek}/week).`,
        affectedDays: [splitIssue.date],
        affectedTimeRanges: day.operatingPeriods.map((p) => ({
          date: splitIssue.date!,
          startTime: p.startTime,
          endTime: p.endTime,
          dayOfWeek: day.dayOfWeek,
        })),
        slotViolationsResolved: 2,
        explanation: 'Multi-period day needs split coverage; cap may block additional split days.',
        rank: TYPE_RANK.ALLOW_EXTRA_SPLIT,
      });
    }
  }

  return recs
    .sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      return b.slotViolationsResolved - a.slotViolationsResolved;
    })
    .slice(0, limit);
}

/** When no solver run yet, estimate violation slots from analyzer critical issues. */
function synthesizeViolationsFromAnalysis(
  input: GenerateScheduleInput,
  analysis: ConstraintAnalysisResult
): SlotViolation[] {
  const interval = input.settings.slotIntervalMinutes;
  const bundles = buildDaySlotBundles(input.days, interval);
  const violations: SlotViolation[] = [];

  for (const issue of analysis.issues) {
    if (issue.severity !== 'critical' && issue.type !== 'STAFF_HOURS_SHORTAGE') continue;
    if (!issue.date) continue;

    const bundle = bundles.find((b) => b.date === issue.date);
    if (!bundle) continue;

    const peakMin = bundle.slots.reduce((max, s) => Math.max(max, s.minCoverage), 0);
    const slotsToMark = Math.min(
      bundle.slots.length,
      Math.max(issue.missing * 2, peakMin * 2, 4)
    );

    for (let i = 0; i < slotsToMark; i++) {
      const slot = bundle.slots[i];
      if (!slot) break;
      violations.push({
        date: issue.date,
        slotId: slot.id,
        startTime: slot.startTime,
        endTime: slot.endTime,
        coverage: Math.max(0, peakMin - issue.missing),
        minCoverage: slot.minCoverage,
      });
    }
  }

  return violations;
}

export function topSmartRecommendations(
  ctx: RecommendationEngineInput,
  limit = 3
): SmartRecommendation[] {
  return generateSmartRecommendations(ctx, limit);
}
