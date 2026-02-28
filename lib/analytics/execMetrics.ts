/**
 * Executive metrics — pure, read-only, boutique-scoped computations.
 * Inputs from existing endpoints or snapshot JSON only.
 */

/** Expected MTD = (monthlyTarget / totalDays) * daysPassed */
export function calcExpectedMTD(
  monthlyTarget: number,
  daysPassed: number,
  totalDays: number
): number {
  if (totalDays <= 0) return 0;
  return (monthlyTarget / totalDays) * Math.max(0, daysPassed);
}

/** Pace EOM = (mtd / daysPassed) * totalDays (run-rate projection) */
export function calcPaceEOM(
  mtd: number,
  daysPassed: number,
  totalDays: number
): number {
  if (daysPassed <= 0) return 0;
  return (mtd / daysPassed) * totalDays;
}

/** YoY ratio = mtd / lyMtd with guards (avoid div by zero, cap extremes) */
export function calcYoYRatio(mtd: number, lyMtd: number): number | null {
  if (lyMtd <= 0 || !Number.isFinite(lyMtd)) return null;
  if (!Number.isFinite(mtd)) return null;
  const ratio = mtd / lyMtd;
  if (ratio < 0 || ratio > 10) return null;
  return ratio;
}

/** trendFactor = clamp(1 + 0.35 * mom, 0.85, 1.15) where mom = last7/prev7 - 1 */
export function calcTrendFactor(last7: number, prev7: number): number {
  if (prev7 <= 0 || !Number.isFinite(prev7)) return 1;
  const mom = Number.isFinite(last7) ? last7 / prev7 - 1 : 0;
  const raw = 1 + 0.35 * mom;
  return Math.max(0.85, Math.min(1.15, raw));
}

export type HybridForecastInput = {
  mtd: number;
  daysPassed: number;
  totalDays: number;
  last7: number | null;
  prev7: number | null;
  lyMtd: number | null;
  lyEom: number | null;
  hasYoY: boolean;
};

export type HybridForecastResult = {
  base: number;
  low: number;
  high: number;
  source: 'hybrid' | 'trend' | 'pace';
};

/**
 * Hybrid forecast:
 * - If YoY available: base = 0.55 * trendEOM + 0.45 * yoyEOM
 * - Else: base = trendEOM (or paceEOM if trend inputs missing)
 * - low = base * 0.93, high = base * 1.07
 */
export function calcHybridForecast(input: HybridForecastInput): HybridForecastResult {
  const { mtd, daysPassed, totalDays, last7, prev7, lyMtd, lyEom, hasYoY } = input;
  const paceEOM = calcPaceEOM(mtd, daysPassed, totalDays);
  const trendFactor =
    last7 != null && prev7 != null ? calcTrendFactor(last7, prev7) : 1;
  const trendEOM = paceEOM * trendFactor;

  let base: number;
  let source: HybridForecastResult['source'];

  if (hasYoY && lyMtd != null && lyMtd > 0 && lyEom != null && lyEom > 0) {
    const yoyRatio = calcYoYRatio(mtd, lyMtd);
    const yoyEOM = yoyRatio != null ? lyEom * yoyRatio : paceEOM;
    base = 0.55 * trendEOM + 0.45 * yoyEOM;
    source = 'hybrid';
  } else if (last7 != null && prev7 != null && prev7 > 0) {
    base = trendEOM;
    source = 'trend';
  } else {
    base = paceEOM;
    source = 'pace';
  }

  return {
    base,
    low: base * 0.93,
    high: base * 1.07,
    source,
  };
}

/** Required per day to hit target = (monthlyTarget - mtd) / daysRemaining */
export function calcRequiredPerDay(
  monthlyTarget: number,
  mtd: number,
  totalDays: number,
  daysPassed: number
): number | null {
  const daysLeft = totalDays - daysPassed;
  if (daysLeft <= 0) return null;
  const gap = monthlyTarget - mtd;
  return gap / daysLeft;
}
