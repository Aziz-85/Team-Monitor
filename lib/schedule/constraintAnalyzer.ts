/**
 * Pre-solve constraint analysis for Schedule Engine v3.
 * Explains whether a week is feasible and what actions would help — does not run the solver.
 */

import { FRIDAY_DOW } from '@/lib/schedule/generateSchedule/operatingPeriods';
import { buildDaySlotBundles } from '@/lib/schedule/generateSchedule/timeSlots';
import { getSchedulePolicy } from '@/lib/schedule/policyEngine';
import type { GenerateScheduleInput, EmployeeCandidate, Unavailability } from '@/lib/schedule/generateSchedule/types';

export type ConstraintAnalysisStatus = 'FEASIBLE' | 'IMPOSSIBLE' | 'NEEDS_SUPPORT';

export type ConstraintIssueType =
  | 'PEAK_COVERAGE_SHORTAGE'
  | 'STAFF_HOURS_SHORTAGE'
  | 'LEAVE_OVERLOAD'
  | 'FRIDAY_COVERAGE'
  | 'WEEKLY_OFF_CONFLICT'
  | 'EXTERNAL_SUPPORT_NEEDED'
  | 'OVERTIME_REQUIRED'
  | 'SPLIT_SHIFT_REQUIRED'
  | 'RAMADAN_HOURS';

export type ConstraintIssueSeverity = 'critical' | 'warning' | 'info';

export type ConstraintIssue = {
  type: ConstraintIssueType;
  severity: ConstraintIssueSeverity;
  date: string | null;
  message: string;
  required: number;
  available: number;
  missing: number;
};

export type ConstraintRecommendationType =
  | 'ADD_EXTERNAL_SUPPORT'
  | 'ALLOW_OVERTIME'
  | 'REDUCE_MIN_COVERAGE'
  | 'MOVE_WEEKLY_OFF'
  | 'ALLOW_EXTRA_SPLIT'
  | 'ADJUST_LEAVE';

export type ConstraintRecommendation = {
  type: ConstraintRecommendationType;
  label: string;
  impact: 'high' | 'medium' | 'low';
  explanation: string;
  estimatedEffect: string;
  rank: number;
};

export type ConstraintAnalysisInsights = {
  whyImpossible: string | null;
  externalSupportWouldHelp: boolean;
  overtimeCouldHelp: boolean;
  reduceLateCoverageCouldHelp: boolean;
  moveWeeklyOffCouldHelp: boolean;
  leaveIsMainBlocker: boolean;
};

export type ConstraintAnalysisSummary = {
  employeeCount: number;
  externalSupportCount: number;
  dayCount: number;
  requiredStaffHours: number;
  availableStaffHours: number;
  missingStaffHours: number;
  requiredCoverageSlots: number;
  availableCoverageSlots: number;
};

export type ConstraintAnalysisResult = {
  feasible: boolean;
  status: ConstraintAnalysisStatus;
  summary: ConstraintAnalysisSummary;
  issues: ConstraintIssue[];
  recommendations: ConstraintRecommendation[];
  insights: ConstraintAnalysisInsights;
  /** Dates with critical coverage blockers (peak headcount or leave overload). */
  impossibleDays: string[];
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

function maxDailyHoursForDay(isRamadan: boolean, input: GenerateScheduleInput): number {
  return isRamadan ? input.settings.ramadanMode.maxDailyHours : input.settings.normalMode.maxDailyHours;
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

function countAvailableEmployees(
  input: GenerateScheduleInput,
  date: string,
  dayOfWeek: number,
  unavail: Map<string, string>,
  includeExternal: boolean
): number {
  const pool = includeExternal
    ? [...input.regularEmployees, ...input.externalSupportEmployees]
    : input.regularEmployees;
  return pool.filter((emp) => isEmployeeAvailable(emp, date, dayOfWeek, unavail)).length;
}

function slotsCoverablePerEmployee(maxDailyHours: number, intervalMinutes: number): number {
  const slotHours = intervalMinutes / 60;
  return slotHours > 0 ? Math.floor(maxDailyHours / slotHours) : 0;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function pushUniqueRecommendation(
  list: ConstraintRecommendation[],
  rec: Omit<ConstraintRecommendation, 'rank'>
): void {
  if (list.some((r) => r.type === rec.type)) return;
  list.push({ ...rec, rank: 0 });
}

const RECOMMENDATION_RANK: Record<ConstraintRecommendationType, number> = {
  ADD_EXTERNAL_SUPPORT: 1,
  ALLOW_OVERTIME: 2,
  MOVE_WEEKLY_OFF: 3,
  ALLOW_EXTRA_SPLIT: 4,
  REDUCE_MIN_COVERAGE: 5,
  ADJUST_LEAVE: 6,
};

function rankRecommendations(recs: ConstraintRecommendation[]): ConstraintRecommendation[] {
  return recs
    .map((r) => ({ ...r, rank: RECOMMENDATION_RANK[r.type] ?? 99 }))
    .sort((a, b) => a.rank - b.rank);
}

/** Analyze schedule constraints before solving. */
export function analyzeScheduleConstraints(input: GenerateScheduleInput): ConstraintAnalysisResult {
  const policy = getSchedulePolicy(input);
  const unavail = buildUnavailMap(input.unavailability);
  const intervalMinutes = input.settings.slotIntervalMinutes;
  const slotHours = intervalMinutes / 60;
  const bundles = buildDaySlotBundles(input.days, intervalMinutes);
  const issues: ConstraintIssue[] = [];
  const recommendations: ConstraintRecommendation[] = [];
  const impossibleDays = new Set<string>();

  let requiredStaffHours = 0;
  let availableStaffHours = 0;
  let requiredCoverageSlots = 0;
  let availableCoverageSlots = 0;

  let hasCritical = false;
  let hasHoursGap = false;
  let needsExternal = false;
  let needsOvertime = false;
  let needsSplit = false;

  for (const bundle of bundles) {
    const day = input.days.find((d) => d.date === bundle.date);
    if (!day) continue;

    const maxDaily = maxDailyHoursForDay(day.isRamadan, input);
    const availableRegular = countAvailableEmployees(input, day.date, day.dayOfWeek, unavail, false);
    const availableAll = countAvailableEmployees(input, day.date, day.dayOfWeek, unavail, true);
    const peakMinCoverage = bundle.slots.reduce((max, s) => Math.max(max, s.minCoverage), 0);

    const dayRequiredHours = bundle.slots.reduce((sum, s) => sum + s.minCoverage * slotHours, 0);
    const dayRequiredSlots = bundle.slots.reduce((sum, s) => sum + s.minCoverage, 0);

    requiredStaffHours += dayRequiredHours;
    requiredCoverageSlots += dayRequiredSlots;

    const regularHours = availableRegular * maxDaily;
    const allHours = availableAll * maxDaily;
    availableStaffHours += allHours;

    const coverablePerEmp = slotsCoverablePerEmployee(maxDaily, intervalMinutes);
    const dayAvailableSlots = Math.min(dayRequiredSlots, availableAll * coverablePerEmp);
    availableCoverageSlots += dayAvailableSlots;

    const leaveCount = input.regularEmployees.filter((emp) => {
      const kind = unavail.get(unavailKey(emp.empId, day.date));
      return kind === 'leave' || kind === 'holiday' || kind === 'absent';
    }).length;

    const weeklyOffCount = input.regularEmployees.filter((emp) => {
      const kind = unavail.get(unavailKey(emp.empId, day.date));
      return kind === 'weekly_off' || (emp.weeklyOffDay !== 'NONE' && emp.weeklyOffDay === day.dayOfWeek);
    }).length;

    if (availableRegular < peakMinCoverage) {
      hasCritical = true;
      impossibleDays.add(day.date);
      issues.push({
        type: 'PEAK_COVERAGE_SHORTAGE',
        severity: 'critical',
        date: day.date,
        message: `Only ${availableRegular} regular employee(s) available but peak minCoverage is ${peakMinCoverage}.`,
        required: peakMinCoverage,
        available: availableRegular,
        missing: peakMinCoverage - availableRegular,
      });
    }

    if (day.dayOfWeek === FRIDAY_DOW && availableAll < peakMinCoverage) {
      hasCritical = true;
      impossibleDays.add(day.date);
      issues.push({
        type: 'FRIDAY_COVERAGE',
        severity: 'critical',
        date: day.date,
        message: `Friday evening coverage needs ${peakMinCoverage} staff but only ${availableAll} available (PM-only operating period).`,
        required: peakMinCoverage,
        available: availableAll,
        missing: peakMinCoverage - availableAll,
      });
    }

    if (leaveCount >= input.regularEmployees.length && input.regularEmployees.length > 0) {
      hasCritical = true;
      impossibleDays.add(day.date);
      issues.push({
        type: 'LEAVE_OVERLOAD',
        severity: 'critical',
        date: day.date,
        message: `All regular employees are on leave, holiday, or absent on this day.`,
        required: peakMinCoverage,
        available: 0,
        missing: peakMinCoverage,
      });
    }

    if (weeklyOffCount > 0 && availableRegular < peakMinCoverage && availableRegular > 0) {
      issues.push({
        type: 'WEEKLY_OFF_CONFLICT',
        severity: 'warning',
        date: day.date,
        message: `${weeklyOffCount} weekly off day(s) reduce regular availability to ${availableRegular}.`,
        required: peakMinCoverage,
        available: availableRegular,
        missing: Math.max(0, peakMinCoverage - availableRegular),
      });
    }

    const dayMissingHours = Math.max(0, dayRequiredHours - regularHours);
    if (dayMissingHours > 0) {
      hasHoursGap = true;
      const severity: ConstraintIssueSeverity =
        availableAll < peakMinCoverage ? 'critical' : 'warning';
      if (severity === 'critical') hasCritical = true;

      issues.push({
        type: 'STAFF_HOURS_SHORTAGE',
        severity,
        date: day.date,
        message: `Regular staff can supply ${round1(regularHours)}h but ${round1(dayRequiredHours)}h are required for slot coverage${day.isRamadan ? ' (Ramadan max daily hours)' : ''}.`,
        required: round1(dayRequiredHours),
        available: round1(regularHours),
        missing: round1(dayMissingHours),
      });

      if (allHours >= dayRequiredHours && availableAll > availableRegular) {
        needsExternal = true;
        issues.push({
          type: 'EXTERNAL_SUPPORT_NEEDED',
          severity: 'warning',
          date: day.date,
          message: `External support can close the gap (${round1(allHours)}h available with support vs ${round1(dayRequiredHours)}h required).`,
          required: round1(dayRequiredHours),
          available: round1(allHours),
          missing: round1(Math.max(0, dayRequiredHours - allHours)),
        });
      } else if (
        input.settings.externalSupportEmployeesAllowed &&
        availableAll < peakMinCoverage + Math.ceil(dayMissingHours / maxDaily)
      ) {
        needsExternal = true;
        issues.push({
          type: 'EXTERNAL_SUPPORT_NEEDED',
          severity: 'warning',
          date: day.date,
          message: `Add external support to cover ${round1(dayMissingHours)} missing staff-hour(s).`,
          required: round1(dayRequiredHours),
          available: round1(allHours),
          missing: round1(dayMissingHours),
        });
      }

      const overtimeHoursNeeded = round1(dayMissingHours);
      if (overtimeHoursNeeded > 0 && availableRegular >= peakMinCoverage) {
        needsOvertime = true;
        issues.push({
          type: 'OVERTIME_REQUIRED',
          severity: 'warning',
          date: day.date,
          message: `Up to ${overtimeHoursNeeded}h of overtime may be required beyond ${maxDaily}h daily cap per employee.`,
          required: round1(dayRequiredHours),
          available: round1(regularHours),
          missing: overtimeHoursNeeded,
        });
      }

      if (
        input.settings.splitShiftAllowed &&
        bundle.operatingPeriods.length > 1 &&
        dayMissingHours > 0
      ) {
        needsSplit = true;
        issues.push({
          type: 'SPLIT_SHIFT_REQUIRED',
          severity: 'info',
          date: day.date,
          message: `Split shifts across ${bundle.operatingPeriods.length} operating periods may be needed (max ${input.settings.maxSplitDaysPerEmployeePerWeek} split days per employee/week).`,
          required: round1(dayRequiredHours),
          available: round1(regularHours),
          missing: round1(dayMissingHours),
        });
      }
    }

    if (day.isRamadan && dayMissingHours > 0) {
      issues.push({
        type: 'RAMADAN_HOURS',
        severity: 'warning',
        date: day.date,
        message: `Ramadan caps daily hours at ${maxDaily}h while operating periods may require more combined coverage.`,
        required: round1(dayRequiredHours),
        available: round1(regularHours),
        missing: round1(dayMissingHours),
      });
    }
  }

  const missingStaffHours = round1(Math.max(0, requiredStaffHours - availableStaffHours));

  const hasLeaveBlocker = issues.some((i) => i.type === 'LEAVE_OVERLOAD');
  const hasWeeklyOffConflict = issues.some((i) => i.type === 'WEEKLY_OFF_CONFLICT');
  const externalSupportWouldHelp =
    missingStaffHours > 0 && policy.externalSupport.allowed && (needsExternal || hasHoursGap);
  const overtimeCouldHelp = needsOvertime && policy.overtime.allowed;
  const reduceLateCoverageCouldHelp = hasHoursGap && !hasCritical;
  const moveWeeklyOffCouldHelp = hasWeeklyOffConflict;

  if (externalSupportWouldHelp) {
    pushUniqueRecommendation(recommendations, {
      type: 'ADD_EXTERNAL_SUPPORT',
      label: 'Add external support employee(s)',
      impact: 'high',
      explanation:
        'Guest or cross-branch support adds headcount without changing regular employee weekly off.',
      estimatedEffect: `Could recover up to ${missingStaffHours}h of missing staff-hours across the week.`,
    });
  }

  if (overtimeCouldHelp) {
    pushUniqueRecommendation(recommendations, {
      type: 'ALLOW_OVERTIME',
      label: 'Allow overtime',
      impact: 'medium',
      explanation:
        'Extend shifts beyond normal daily caps (last resort — policy allows overtime when needed).',
      estimatedEffect: `May cover shortfalls on days with ${round1(missingStaffHours / Math.max(1, input.days.length))}h average gap.`,
    });
  }

  if (moveWeeklyOffCouldHelp) {
    pushUniqueRecommendation(recommendations, {
      type: 'MOVE_WEEKLY_OFF',
      label: 'Move weekly off day(s)',
      impact: 'medium',
      explanation: 'Stagger weekly off days so more regular employees are available on high-coverage days.',
      estimatedEffect: 'Can restore peak headcount on conflict days without adding staff.',
    });
  }

  if (needsSplit && policy.split.allowed) {
    pushUniqueRecommendation(recommendations, {
      type: 'ALLOW_EXTRA_SPLIT',
      label: 'Allow extra split days',
      impact: 'medium',
      explanation: `Split shifts across operating periods (cap: ${policy.split.maxDaysPerEmployeePerWeek}/employee/week).`,
      estimatedEffect: 'Helps cover Ramadan or multi-period days when single blocks are too short.',
    });
  }

  if (reduceLateCoverageCouldHelp) {
    pushUniqueRecommendation(recommendations, {
      type: 'REDUCE_MIN_COVERAGE',
      label: 'Reduce minCoverage after peak hours',
      impact: 'low',
      explanation: 'If policy allows, lower late-slot minCoverage to match available staff.',
      estimatedEffect: 'Reduces required slot units without adding hours or headcount.',
    });
  }

  if (hasLeaveBlocker) {
    pushUniqueRecommendation(recommendations, {
      type: 'ADJUST_LEAVE',
      label: 'Cancel or adjust leave',
      impact: 'high',
      explanation: 'Too many employees are on approved leave the same day.',
      estimatedEffect: 'Restores regular staff availability on blocked day(s).',
    });
  }

  const rankedRecommendations = rankRecommendations(recommendations);

  let status: ConstraintAnalysisStatus;
  if (hasCritical) {
    status = 'IMPOSSIBLE';
  } else if (hasHoursGap || needsExternal || needsOvertime || needsSplit) {
    status = 'NEEDS_SUPPORT';
  } else {
    status = 'FEASIBLE';
  }

  if (
    status === 'NEEDS_SUPPORT' &&
    !policy.externalSupport.allowed &&
    missingStaffHours > 0
  ) {
    status = 'IMPOSSIBLE';
  }

  const whyImpossible =
    status === 'IMPOSSIBLE'
      ? issues.find((i) => i.severity === 'critical')?.message ??
        `Missing ${missingStaffHours}h staff-hours with no viable support path.`
      : null;

  const insights: ConstraintAnalysisInsights = {
    whyImpossible,
    externalSupportWouldHelp,
    overtimeCouldHelp,
    reduceLateCoverageCouldHelp,
    moveWeeklyOffCouldHelp,
    leaveIsMainBlocker: hasLeaveBlocker,
  };

  return {
    feasible: status === 'FEASIBLE',
    status,
    summary: {
      employeeCount: input.regularEmployees.length,
      externalSupportCount: input.externalSupportEmployees.length,
      dayCount: input.days.length,
      requiredStaffHours: round1(requiredStaffHours),
      availableStaffHours: round1(availableStaffHours),
      missingStaffHours,
      requiredCoverageSlots,
      availableCoverageSlots,
    },
    issues,
    recommendations: rankedRecommendations,
    insights,
    impossibleDays: Array.from(impossibleDays).sort(),
  };
}

/** Primary human-readable reason from analysis. */
export function mainConstraintReason(result: ConstraintAnalysisResult): string {
  const critical = result.issues.find((i) => i.severity === 'critical');
  if (critical) return critical.message;
  const warning = result.issues.find((i) => i.severity === 'warning');
  if (warning) return warning.message;
  if (result.status === 'FEASIBLE') return 'Staffing and hours appear sufficient for configured coverage.';
  return 'Coverage may require support, overtime, or split shifts.';
}

/** Top recommended fix label, if any. */
export function topConstraintRecommendation(result: ConstraintAnalysisResult): string | null {
  const ranked = result.recommendations[0];
  if (ranked) return ranked.label;
  return null;
}
