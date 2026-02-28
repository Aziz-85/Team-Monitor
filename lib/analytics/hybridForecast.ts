/**
 * Hybrid forecast (D) — pure functions. All money values in halalas.
 */

/** expectedMTD = (target / D) * d */
export function expectedMTD(
  targetHalalas: number,
  daysPassed: number,
  totalDays: number
): number {
  if (totalDays <= 0) return 0;
  return Math.round((targetHalalas / totalDays) * Math.max(0, daysPassed));
}

/** paceEOM = (mtd / d) * D */
export function paceEOM(
  mtdHalalas: number,
  daysPassed: number,
  totalDays: number
): number {
  if (daysPassed <= 0) return 0;
  return Math.round((mtdHalalas / daysPassed) * totalDays);
}

/** mom = (last7 / prev7) - 1; guard divide by zero */
export function mom(last7: number, prev7: number): number {
  if (prev7 <= 0 || !Number.isFinite(prev7)) return 0;
  return Number.isFinite(last7) ? last7 / prev7 - 1 : 0;
}

/** trendFactor = clamp(1 + 0.35*mom, 0.85, 1.15) */
export function trendFactor(last7: number, prev7: number): number {
  const m = mom(last7, prev7);
  const raw = 1 + 0.35 * m;
  return Math.max(0.85, Math.min(1.15, raw));
}

/** trendEOM = paceEOM * trendFactor */
export function trendEOM(
  mtdHalalas: number,
  daysPassed: number,
  totalDays: number,
  last7: number,
  prev7: number
): number {
  const pace = paceEOM(mtdHalalas, daysPassed, totalDays);
  return Math.round(pace * trendFactor(last7, prev7));
}

export type HybridForecastInputHalalas = {
  mtdHalalas: number;
  daysPassed: number;
  totalDays: number;
  targetHalalas: number;
  last7: number | null;
  prev7: number | null;
  lyMtdHalalas: number | null;
  lyEomHalalas: number | null;
};

export type HybridForecastResultHalalas = {
  base: number;
  low: number;
  high: number;
  requiredPerDay: number | null;
  source: 'hybrid' | 'trend' | 'pace';
};

/**
 * If YoY: yoyRatio = mtd/lyMtd, yoyEOM = lyEom*yoyRatio, base = 0.55*trendEOM + 0.45*yoyEOM.
 * Else: base = trendEOM (fallback to paceEOM if last7/prev7 missing).
 * low = base*0.93, high = base*1.07.
 * requiredPerDay = (target - mtd) / max(1, D-d). All halalas.
 */
export function hybridForecast(
  input: HybridForecastInputHalalas
): HybridForecastResultHalalas {
  const {
    mtdHalalas,
    daysPassed,
    totalDays,
    targetHalalas,
    last7,
    prev7,
    lyMtdHalalas,
    lyEomHalalas,
  } = input;

  const pace = paceEOM(mtdHalalas, daysPassed, totalDays);
  const trend =
    last7 != null && prev7 != null && prev7 > 0
      ? trendEOM(mtdHalalas, daysPassed, totalDays, last7, prev7)
      : pace;

  let base: number;
  let source: HybridForecastResultHalalas['source'];

  if (
    lyMtdHalalas != null &&
    lyMtdHalalas > 0 &&
    lyEomHalalas != null &&
    lyEomHalalas > 0
  ) {
    const yoyRatio = mtdHalalas / lyMtdHalalas;
    const yoyEOM = Math.round(lyEomHalalas * yoyRatio);
    base = Math.round(0.55 * trend + 0.45 * yoyEOM);
    source = 'hybrid';
  } else if (last7 != null && prev7 != null && prev7 > 0) {
    base = trend;
    source = 'trend';
  } else {
    base = pace;
    source = 'pace';
  }

  const low = Math.round(base * 0.93);
  const high = Math.round(base * 1.07);
  const daysLeft = totalDays - daysPassed;
  const requiredPerDay =
    daysLeft >= 1
      ? Math.round((targetHalalas - mtdHalalas) / daysLeft)
      : null;

  return {
    base,
    low,
    high,
    requiredPerDay,
    source,
  };
}
