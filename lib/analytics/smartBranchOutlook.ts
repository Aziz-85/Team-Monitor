/**
 * Explainable smart forecast & smart required targets for a boutique branch.
 * Uses branch SalesEntry daily totals × day-of-week (Riyadh calendar) averages only — no ML, no external APIs.
 * SAR integers on output; internal floats for proportions, rounded deterministically.
 */

import { getDaysInMonth } from '@/lib/time';

export type SmartConfidence = 'high' | 'medium' | 'low';

export type SmartWeekdayProfile = {
  /** Branch average total SAR per calendar day for this Sat-based DOW (0=Sat … 6=Fri). */
  avgBySatDow: number[];
  /** Count of historical days contributing per DOW. */
  sampleCountBySatDow: number[];
  totalSampleDays: number;
};

export type SmartRequiredResult = {
  smartDailyRequiredSar: number;
  smartWeeklyRequiredSar: number;
  linearDailyRequiredSar: number;
  linearWeeklyRequiredSar: number;
  usedEqualWeightFallback: boolean;
  explain: string;
  /** SAR allocation per remaining calendar day in month (dateKey → SAR), for optional UI drill-down. */
  dailyBreakdownRemainingMonth: Record<string, number>;
};

export type SmartForecastResult = {
  forecastSmartSar: number;
  projectedRemainingSmartSar: number;
  varianceVsTargetSar: number;
  confidence: SmartConfidence;
  rangeConservativeSar: number;
  rangeExpectedSar: number;
  rangeStretchSar: number;
  linearForecastTotalSar: number;
  usedHistoryFallbackForForecast: boolean;
  explain: string;
};

const HISTORY_MIN_TOTAL_DAYS = 21;
const HISTORY_HIGH_TOTAL_DAYS = 56;
const CV_HIGH_THRESHOLD = 0.38;
const MTD_DAYS_FOR_HIGH_CONFIDENCE = 5;

/** Riyadh business convention: 0 = Saturday … 6 = Friday */
export function riyadhSatBasedDow(dateKey: string): number {
  const d = new Date(dateKey.trim() + 'T12:00:00.000Z');
  const utc = d.getUTCDay();
  return (utc + 1) % 7;
}

export function listRemainingDateKeysInMonth(monthKey: string, fromDateKeyInclusive: string): string[] {
  const mk = monthKey.trim();
  const dim = getDaysInMonth(mk);
  const [y, m] = mk.split('-').map(Number);
  const mm = String(m).padStart(2, '0');
  const out: string[] = [];
  for (let day = 1; day <= dim; day++) {
    const dk = `${y}-${mm}-${String(day).padStart(2, '0')}`;
    if (dk >= fromDateKeyInclusive) out.push(dk);
  }
  return out;
}

export function buildWeekdayProfileFromHistory(
  historyDailyTotals: Array<{ dateKey: string; amountSar: number }>
): SmartWeekdayProfile {
  const sumBy = [0, 0, 0, 0, 0, 0, 0];
  const cntBy = [0, 0, 0, 0, 0, 0, 0];
  for (const row of historyDailyTotals) {
    const amt = Math.max(0, Math.trunc(row.amountSar));
    const dow = riyadhSatBasedDow(row.dateKey);
    sumBy[dow] += amt;
    cntBy[dow] += 1;
  }
  const avgBySatDow = sumBy.map((s, i) => (cntBy[i] > 0 ? Math.round(s / cntBy[i]) : 0));
  const totalSampleDays = cntBy.reduce((a, b) => a + b, 0);
  return { avgBySatDow, sampleCountBySatDow: cntBy, totalSampleDays };
}

function dowCvRatio(avgBySatDow: number[]): number {
  const mean = avgBySatDow.reduce((a, b) => a + b, 0) / 7;
  if (mean <= 0) return 1;
  const var7 = avgBySatDow.reduce((acc, v) => acc + (v - mean) ** 2, 0) / 7;
  const sd = Math.sqrt(Math.max(0, var7));
  return sd / mean;
}

export function estimateConfidence(input: {
  totalHistoryDays: number;
  avgBySatDow: number[];
  paceDaysPassed: number;
}): SmartConfidence {
  const cv = dowCvRatio(input.avgBySatDow);
  if (
    input.totalHistoryDays >= HISTORY_HIGH_TOTAL_DAYS &&
    cv < CV_HIGH_THRESHOLD &&
    input.paceDaysPassed >= MTD_DAYS_FOR_HIGH_CONFIDENCE
  ) {
    return 'high';
  }
  if (input.totalHistoryDays >= HISTORY_MIN_TOTAL_DAYS) return 'medium';
  return 'low';
}

/**
 * Relative weights for each Sat-based DOW. When history is thin, returns equal weights (1..1).
 */
export function buildSmartDowWeights(profile: SmartWeekdayProfile): {
  weightsBySatDow: number[];
  usedEqualWeightFallback: boolean;
  explainWeights: string;
} {
  const usedEqualWeightFallback = profile.totalSampleDays < HISTORY_MIN_TOTAL_DAYS;

  if (usedEqualWeightFallback) {
    return {
      weightsBySatDow: [1, 1, 1, 1, 1, 1, 1],
      usedEqualWeightFallback: true,
      explainWeights:
        'Weights are equal across weekdays (fallback): fewer than 21 historical branch days in the lookback window.',
    };
  }
  const w = profile.avgBySatDow.map((a) => Math.max(1, Math.round(a)));
  return {
    weightsBySatDow: w,
    usedEqualWeightFallback: false,
    explainWeights:
      'Weights are proportional to average branch total sales by day-of-week (Riyadh calendar, Sat=0 … Fri=6), from recent history.',
  };
}

/** Largest-remainder integer allocation so parts sum exactly to total. */
export function allocateProportionalSar(total: number, weights: number[]): number[] {
  const t = Math.max(0, Math.trunc(total));
  const W = weights.reduce((a, b) => a + Math.max(0, b), 0);
  if (t === 0 || W <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (t * Math.max(0, w)) / W);
  const floors = raw.map((x) => Math.floor(x));
  const rem = t - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((x, i) => ({ i, frac: x - floors[i] }))
    .sort((a, b) => b.frac - a.frac);
  const out = [...floors];
  for (let k = 0; k < rem; k++) {
    out[order[k % order.length].i] += 1;
  }
  return out;
}

export function computeSmartRequiredFromWeights(input: {
  remainingMonthTargetSar: number;
  remainingDateKeysInMonth: string[];
  weekRemainingDateKeys: string[];
  weightsBySatDow: number[];
  usedEqualWeightFallback: boolean;
  explainWeights: string;
  linearDailyRequiredSar: number;
  linearWeeklyRequiredSar: number;
}): SmartRequiredResult {
  const rem = Math.max(0, Math.trunc(input.remainingMonthTargetSar));
  const keys = input.remainingDateKeysInMonth;
  const wts = keys.map((dk) => {
    const dow = riyadhSatBasedDow(dk);
    return input.weightsBySatDow[dow] ?? 1;
  });
  const alloc = allocateProportionalSar(rem, wts);
  const breakdown: Record<string, number> = {};
  keys.forEach((dk, i) => {
    breakdown[dk] = alloc[i] ?? 0;
  });
  const todayKey = keys[0];
  const smartDaily = todayKey != null ? breakdown[todayKey] ?? 0 : 0;
  let smartWeek = 0;
  const weekSet = new Set(input.weekRemainingDateKeys);
  for (const dk of keys) {
    if (weekSet.has(dk)) smartWeek += breakdown[dk] ?? 0;
  }
  return {
    smartDailyRequiredSar: smartDaily,
    smartWeeklyRequiredSar: smartWeek,
    linearDailyRequiredSar: input.linearDailyRequiredSar,
    linearWeeklyRequiredSar: input.linearWeeklyRequiredSar,
    usedEqualWeightFallback: input.usedEqualWeightFallback,
    explain: input.explainWeights,
    dailyBreakdownRemainingMonth: breakdown,
  };
}

export function computeSmartForecastFromProfile(input: {
  actualMtdSar: number;
  monthlyTargetSar: number;
  remainingDateKeysInMonth: string[];
  avgBySatDow: number[];
  usedEqualWeightFallback: boolean;
  totalHistorySampleDays: number;
  paceDaysPassed: number;
  daysInMonth: number;
  linearForecastTotalSar: number;
}): SmartForecastResult {
  const mtd = Math.max(0, Math.trunc(input.actualMtdSar));
  const target = Math.max(0, Math.trunc(input.monthlyTargetSar));
  const keys = input.remainingDateKeysInMonth;
  const D = Math.max(0, Math.trunc(input.daysInMonth));
  const dPass = Math.max(0, Math.trunc(input.paceDaysPassed));

  const expectedPerKey = keys.map((dk) => {
    const dow = riyadhSatBasedDow(dk);
    const h = input.avgBySatDow[dow] ?? 0;
    return Math.max(0, Math.round(h));
  });

  let projected = expectedPerKey.reduce((a, b) => a + b, 0);

  let usedHistoryFallbackForForecast = input.usedEqualWeightFallback;
  if (usedHistoryFallbackForForecast || projected === 0) {
    const dEff = D > 0 ? Math.min(Math.max(1, dPass < 1 ? 1 : dPass), D) : 1;
    const runRate = dEff > 0 ? Math.round(mtd / dEff) : 0;
    projected = runRate * keys.length;
    usedHistoryFallbackForForecast = true;
  }

  const forecastSmart = mtd + projected;
  const varianceVsTarget = target - forecastSmart;
  let confidence = estimateConfidence({
    totalHistoryDays: Math.max(0, Math.trunc(input.totalHistorySampleDays)),
    avgBySatDow: input.avgBySatDow,
    paceDaysPassed: dPass,
  });
  if (input.usedEqualWeightFallback || usedHistoryFallbackForForecast) {
    if (confidence === 'high') confidence = 'medium';
  }

  const conservative = keys.reduce((acc, dk) => {
    const dow = riyadhSatBasedDow(dk);
    const base = Math.max(0, input.avgBySatDow[dow] ?? 0);
    return acc + Math.round(base * 0.85);
  }, 0);
  const stretch = keys.reduce((acc, dk) => {
    const dow = riyadhSatBasedDow(dk);
    const base = Math.max(0, input.avgBySatDow[dow] ?? 0);
    return acc + Math.round(base * 1.12);
  }, 0);

  const rangeExpected = projected;
  const rangeConservative = usedHistoryFallbackForForecast ? Math.round(projected * 0.9) : conservative;
  const rangeStretch = usedHistoryFallbackForForecast ? Math.round(projected * 1.1) : stretch;

  return {
    forecastSmartSar: forecastSmart,
    projectedRemainingSmartSar: projected,
    varianceVsTargetSar: varianceVsTarget,
    confidence,
    rangeConservativeSar: mtd + rangeConservative,
    rangeExpectedSar: mtd + rangeExpected,
    rangeStretchSar: mtd + rangeStretch,
    linearForecastTotalSar: input.linearForecastTotalSar,
    usedHistoryFallbackForForecast,
    explain: usedHistoryFallbackForForecast
      ? 'Forecast remainder used linear run-rate (MTD ÷ completed accounting days × remaining days) because historical DOW pattern was insufficient or zero.'
      : 'Forecast remainder sums branch average total sales for each remaining calendar day’s weekday (from recent history), plus achieved MTD.',
  };
}
