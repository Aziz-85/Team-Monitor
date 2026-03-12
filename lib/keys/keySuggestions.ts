/**
 * Key suggestion engine for week plan.
 * Derives suggested AM/PM holders per day from roster (eligible) and continuity.
 * Priorities: reduce handover churn, prefer continuity (prev PM → today AM; today PM → tomorrow AM).
 * Does not write to DB; suggestions are advisory for UI autofill only.
 */

export type KeyDayEligible = {
  date: string;
  amHolderEmpId: string | null;
  pmHolderEmpId: string | null;
  amEligible: Array<{ empId: string; name: string }>;
  pmEligible: Array<{ empId: string; name: string }>;
};

export type KeySuggestionWarningCode =
  | 'MISSING_AM_HOLDER'
  | 'MISSING_PM_HOLDER'
  | 'AM_NOT_ELIGIBLE'
  | 'PM_NOT_ELIGIBLE'
  | 'AM_EQ_PM'
  | 'CONTINUITY_RISK'
  | 'NO_SUGGESTION_AM'
  | 'NO_SUGGESTION_PM'
  | 'HOLDER_ON_LEAVE_OR_OFF'
  | 'MANUAL_OVERRIDE_BREAKS_CONTINUITY'
  | 'HANDOVER_REQUIRED_BETWEEN_DAYS'
  | 'NO_SAFE_NEXT_AM_RECEIVER'
  | 'SUGGESTION_REDUCED_CONTINUITY_RISK'
  | 'MULTIPLE_VALID_OPTIONS_MANUAL_REVIEW';

export type KeySuggestionWarning = {
  date: string;
  code: KeySuggestionWarningCode;
  message: string;
};

export type KeyDayWithSuggestions = KeyDayEligible & {
  suggestedAmHolderEmpId: string | null;
  suggestedPmHolderEmpId: string | null;
  warnings: KeySuggestionWarning[];
};

/**
 * AM suggestion priority (when no saved AM):
 * 1. Previous day PM if valid for today AM (continuity).
 * 2. Else: AM-eligible who is also PM-eligible today (can hold PM today → clean AM tomorrow).
 * 3. Else: first AM-eligible (stable, deterministic).
 */
function pickSuggestedAm(
  day: KeyDayEligible,
  prevDay: KeyDayWithSuggestions | null,
  amEmpIds: Set<string>,
  pmEmpIds: Set<string>
): { empId: string | null; tie: boolean } {
  if (day.amHolderEmpId) return { empId: day.amHolderEmpId, tie: false };
  const prevPm = prevDay?.pmHolderEmpId ?? prevDay?.suggestedPmHolderEmpId ?? null;
  if (prevPm && amEmpIds.has(prevPm)) return { empId: prevPm, tie: false };
  const amAlsoPm = day.amEligible.filter((e) => pmEmpIds.has(e.empId));
  if (amAlsoPm.length > 0) return { empId: amAlsoPm[0].empId, tie: amAlsoPm.length > 1 };
  if (day.amEligible.length > 0) return { empId: day.amEligible[0].empId, tie: day.amEligible.length > 1 };
  return { empId: null, tie: false };
}

/**
 * PM suggestion priority (when no saved PM):
 * 1. PM-eligible (and ≠ suggested AM) who is AM-eligible tomorrow (continuity into next day AM).
 * 2. Else: first PM-eligible that is not suggested AM (stable).
 */
function pickSuggestedPm(
  day: KeyDayEligible,
  nextDay: KeyDayEligible | null,
  suggestedAm: string | null
): { empId: string | null; tie: boolean } {
  if (day.pmHolderEmpId) return { empId: day.pmHolderEmpId, tie: false };
  const nextAmEmpIds = nextDay ? new Set(nextDay.amEligible.map((e) => e.empId)) : new Set<string>();
  const pmCandidates = day.pmEligible.filter((e) => e.empId !== suggestedAm);
  const continuityCandidates = pmCandidates.filter((e) => nextAmEmpIds.has(e.empId));
  if (continuityCandidates.length > 0) return { empId: continuityCandidates[0].empId, tie: continuityCandidates.length > 1 };
  if (pmCandidates.length > 0) return { empId: pmCandidates[0].empId, tie: pmCandidates.length > 1 };
  if (day.pmEligible.length > 0 && day.pmEligible[0].empId !== suggestedAm) return { empId: day.pmEligible[0].empId, tie: false };
  return { empId: null, tie: false };
}

/**
 * Compute suggested AM/PM holders for each day with churn-reduction and structured warnings.
 */
export function computeSuggestionsAndWarnings(
  days: KeyDayEligible[]
): KeyDayWithSuggestions[] {
  const result: KeyDayWithSuggestions[] = [];
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));

  for (let i = 0; i < sorted.length; i++) {
    const day = sorted[i];
    const prevDay = i > 0 ? result[i - 1] : null;
    const nextDay = i < sorted.length - 1 ? sorted[i + 1] : null;
    const amEmpIds = new Set(day.amEligible.map((e) => e.empId));
    const pmEmpIds = new Set(day.pmEligible.map((e) => e.empId));
    const warnings: KeySuggestionWarning[] = [];

    const amPick = pickSuggestedAm(day, prevDay, amEmpIds, pmEmpIds);
    const suggestedAm: string | null = amPick.empId;
    if (!suggestedAm) warnings.push({ date: day.date, code: 'NO_SUGGESTION_AM', message: `No eligible AM holder for ${day.date}.` });

    const pmPick = pickSuggestedPm(day, nextDay, suggestedAm);
    const suggestedPm: string | null = pmPick.empId;
    if (!suggestedPm) warnings.push({ date: day.date, code: 'NO_SUGGESTION_PM', message: `No eligible PM holder for ${day.date}.` });

    if (amPick.tie || pmPick.tie) {
      const parts = [];
      if (amPick.tie) parts.push('AM');
      if (pmPick.tie) parts.push('PM');
      warnings.push({ date: day.date, code: 'MULTIPLE_VALID_OPTIONS_MANUAL_REVIEW', message: `Multiple valid ${parts.join('/')} options for ${day.date}; review if needed.` });
    }

    const effectiveAm = day.amHolderEmpId ?? suggestedAm;
    const effectivePm = day.pmHolderEmpId ?? suggestedPm;

    if (!effectiveAm) warnings.push({ date: day.date, code: 'MISSING_AM_HOLDER', message: `AM key holder is required for ${day.date}.` });
    if (!effectivePm) warnings.push({ date: day.date, code: 'MISSING_PM_HOLDER', message: `PM key holder is required for ${day.date}.` });
    if (effectiveAm && !amEmpIds.has(effectiveAm)) warnings.push({ date: day.date, code: 'AM_NOT_ELIGIBLE', message: `AM holder is not scheduled AM on ${day.date}.` });
    if (effectivePm && !pmEmpIds.has(effectivePm)) warnings.push({ date: day.date, code: 'PM_NOT_ELIGIBLE', message: `PM holder is not scheduled PM on ${day.date}.` });
    if (effectiveAm && effectivePm && effectiveAm === effectivePm) warnings.push({ date: day.date, code: 'AM_EQ_PM', message: `AM and PM holders must be different on ${day.date}.` });

    const prevPm = prevDay?.pmHolderEmpId ?? prevDay?.suggestedPmHolderEmpId ?? null;
    const savedAmBreaksContinuity = day.amHolderEmpId != null && prevPm != null && amEmpIds.has(prevPm) && day.amHolderEmpId !== prevPm;
    if (savedAmBreaksContinuity) {
      warnings.push({ date: day.date, code: 'MANUAL_OVERRIDE_BREAKS_CONTINUITY', message: `Saved AM differs from previous day PM; handover could be avoided.` });
      warnings.push({ date: day.date, code: 'SUGGESTION_REDUCED_CONTINUITY_RISK', message: `Using suggested AM (previous day PM) would reduce handover.` });
    }

    result.push({
      ...day,
      suggestedAmHolderEmpId: suggestedAm,
      suggestedPmHolderEmpId: suggestedPm,
      warnings,
    });
  }

  for (let i = 0; i < result.length - 1; i++) {
    const day = result[i];
    const nextDay = result[i + 1];
    const pmToday = day.pmHolderEmpId ?? day.suggestedPmHolderEmpId;
    const amNext = nextDay.amHolderEmpId ?? nextDay.suggestedAmHolderEmpId;
    const nextAmEmpIds = new Set(nextDay.amEligible.map((e) => e.empId));
    if (pmToday && amNext && pmToday !== amNext && !nextAmEmpIds.has(pmToday)) {
      day.warnings.push({ date: day.date, code: 'CONTINUITY_RISK', message: `PM holder (${day.date}) is not AM next day; ensure handover is planned.` });
      day.warnings.push({ date: day.date, code: 'HANDOVER_REQUIRED_BETWEEN_DAYS', message: `Handover required between ${day.date} PM and ${nextDay.date} AM.` });
    }
    if (pmToday && !nextAmEmpIds.has(pmToday)) {
      const nextHasAm = (nextDay.amHolderEmpId ?? nextDay.suggestedAmHolderEmpId) != null;
      if (!nextHasAm) {
        day.warnings.push({ date: day.date, code: 'NO_SAFE_NEXT_AM_RECEIVER', message: `Next day (${nextDay.date}) has no AM receiver; handover target unclear.` });
      }
    }
  }

  return result;
}
