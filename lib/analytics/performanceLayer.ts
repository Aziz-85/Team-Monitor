/**
 * Smart Performance & Forecast Layer (v2.3.0) — pure, read-only analytics on SAR integers.
 * No I/O. Consumers pass aggregates from SalesEntry + monthly targets (already resolved upstream).
 */

export type SarInt = number;

function toSarInt(n: unknown): SarInt {
  if (typeof n !== 'number' || !Number.isFinite(n)) return 0;
  return Math.trunc(n);
}

/** Safe divisor for pace/forecast: always ≥ 1 */
export function effectiveDaysPassed(daysPassed: number, totalDaysInMonth: number): number {
  const d = toSarInt(daysPassed);
  const cap = Math.max(1, toSarInt(totalDaysInMonth));
  if (d < 1) return 1;
  return Math.min(d, cap);
}

/**
 * Linear MTD pace uses completed business days, not the calendar day, until a SalesEntry exists
 * for the Riyadh calendar "today" (end-of-day posting). If there is no entry yet for today,
 * today counts as not started → use (calendarDay − 1) capped to [0, daysInMonth].
 */
export function paceDaysPassedForMonth(
  todayDayOfMonth: number,
  daysInMonth: number,
  hasSalesEntryForCalendarToday: boolean
): number {
  const D = Math.max(0, toSarInt(daysInMonth));
  const cal = toSarInt(todayDayOfMonth);
  if (D <= 0 || cal < 1) return 0;
  const raw = hasSalesEntryForCalendarToday ? cal : cal - 1;
  return Math.min(Math.max(0, raw), D);
}

export type ProductivityMetrics = {
  totalSalesMTD: SarInt;
  activeDays: SarInt;
  avgDailySales: SarInt;
  salesPerActiveDay: SarInt;
  contributionPct: SarInt;
};

/**
 * Employee / boutique slice productivity. "Active" days = days with SalesEntry sum > 0 (caller counts).
 * contributionPct = round(100 * employeeMTD / boutiqueMTD), 0 if boutique MTD is 0.
 */
export function computeProductivityMetrics(input: {
  totalSalesMTD: number;
  activeDays: number;
  boutiqueMTD: number;
}): ProductivityMetrics {
  const totalSalesMTD = toSarInt(input.totalSalesMTD);
  const boutiqueMTD = toSarInt(input.boutiqueMTD);
  const active = toSarInt(input.activeDays);
  const activeDays = totalSalesMTD > 0 ? Math.max(1, active) : 0;
  const avgDailySales =
    activeDays > 0 ? Math.round(totalSalesMTD / activeDays) : 0;
  const salesPerActiveDay = avgDailySales;
  const contributionPct =
    boutiqueMTD > 0 ? Math.round((100 * totalSalesMTD) / boutiqueMTD) : 0;
  return {
    totalSalesMTD,
    activeDays,
    avgDailySales,
    salesPerActiveDay,
    contributionPct: Math.min(100, Math.max(0, contributionPct)),
  };
}

export type PaceBand = 'ahead' | 'onTrack' | 'behind';

export type PaceMetrics = {
  expectedToDate: SarInt;
  paceDelta: SarInt;
  paceRatio: number | null;
  band: PaceBand;
};

/**
 * Pace vs monthly target (linear expectation by calendar day).
 * expectedToDate = round(monthlyTarget * daysPassed / totalDaysInMonth)
 */
export function computePaceMetrics(input: {
  actualMTD: number;
  monthlyTarget: number;
  totalDaysInMonth: number;
  daysPassed: number;
}): PaceMetrics {
  const actualMTD = toSarInt(input.actualMTD);
  const monthlyTarget = toSarInt(input.monthlyTarget);
  const D = Math.max(0, toSarInt(input.totalDaysInMonth));
  const dRaw = toSarInt(input.daysPassed);
  const d = D > 0 ? Math.min(Math.max(0, dRaw), D) : 0;

  const expectedToDate =
    D > 0 && d > 0 ? Math.round((monthlyTarget * d) / D) : 0;

  const paceDelta = actualMTD - expectedToDate;

  let paceRatio: number | null = null;
  if (expectedToDate > 0) paceRatio = actualMTD / expectedToDate;
  else if (actualMTD > 0) paceRatio = null;

  let band: PaceBand = 'onTrack';
  if (expectedToDate <= 0 && actualMTD <= 0) band = 'onTrack';
  else if (expectedToDate <= 0 && actualMTD > 0) band = 'ahead';
  else if (paceRatio != null) {
    if (paceRatio > 1.05) band = 'ahead';
    else if (paceRatio < 0.95) band = 'behind';
    else band = 'onTrack';
  }

  return { expectedToDate, paceDelta, paceRatio, band };
}

export type ForecastMetrics = {
  forecastedTotal: SarInt;
  forecastDelta: SarInt;
  forecastRatio: number | null;
  avgDailyActual: SarInt;
};

/**
 * Linear month-end projection: avgDailyActual = actualMTD / daysPassed, forecast = avgDailyActual * D.
 * daysPassed forced ≥ 1 to avoid division by zero.
 */
export function computeForecast(input: {
  actualMTD: number;
  monthlyTarget: number;
  totalDaysInMonth: number;
  daysPassed: number;
}): ForecastMetrics {
  const actualMTD = toSarInt(input.actualMTD);
  const monthlyTarget = toSarInt(input.monthlyTarget);
  const D = Math.max(0, toSarInt(input.totalDaysInMonth));
  const dRaw = toSarInt(input.daysPassed);
  /** Match accounting-day pace: 0 completed days → divisor 1 so MTD/1 is well-defined when MTD is 0. */
  const dEff = D > 0 ? Math.min(Math.max(1, dRaw < 1 ? 1 : dRaw), D) : 1;
  const avgDailyActual = Math.round(actualMTD / dEff);
  const forecastedTotal = D > 0 ? avgDailyActual * D : 0;
  const forecastDelta = forecastedTotal - monthlyTarget;
  const forecastRatio =
    monthlyTarget > 0 ? forecastedTotal / monthlyTarget : null;
  return {
    forecastedTotal,
    forecastDelta,
    forecastRatio,
    avgDailyActual,
  };
}

/**
 * Optional: 7-day rolling average daily sales, projected to month-end (integer SAR).
 */
export function computeForecastRolling7(input: {
  /** Up to 7 daily totals, oldest → newest; missing days should be 0 */
  lastSevenDayTotals: number[];
  totalDaysInMonth: number;
  monthlyTarget: number;
}): ForecastMetrics | null {
  const D = Math.max(0, toSarInt(input.totalDaysInMonth));
  if (D <= 0) return null;
  const slice = input.lastSevenDayTotals.map(toSarInt).slice(-7);
  if (slice.length === 0) return null;
  const sum = slice.reduce((a, b) => a + b, 0);
  const avgDailyActual = Math.round(sum / 7);
  const forecastedTotal = avgDailyActual * D;
  const monthlyTarget = toSarInt(input.monthlyTarget);
  return {
    forecastedTotal,
    forecastDelta: forecastedTotal - monthlyTarget,
    forecastRatio: monthlyTarget > 0 ? forecastedTotal / monthlyTarget : null,
    avgDailyActual,
  };
}
