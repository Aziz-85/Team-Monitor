/**
 * Pure calculators for experimental Sales Test module (no I/O).
 * SAR integers only; guards divide-by-zero.
 */

export type MonthContext = {
  totalDaysInMonth: number;
  dayOfMonth: number;
  elapsedDays: number;
  remainingDaysIncludingToday: number;
};

export function monthContextFromDateKey(dateKey: string): MonthContext | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  const totalDaysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  if (d < 1 || d > totalDaysInMonth) return null;
  const elapsedDays = Math.max(1, d);
  const remainingDaysIncludingToday = totalDaysInMonth - d + 1;
  return { totalDaysInMonth, dayOfMonth: d, elapsedDays, remainingDaysIncludingToday };
}

export function pctRatio(numer: number, denom: number): number | null {
  if (!Number.isFinite(numer) || !Number.isFinite(denom) || denom === 0) return null;
  return Math.round((numer * 100) / denom);
}

export function dailyAchievementPct(todaySales: number, dailyTarget: number): number | null {
  return pctRatio(todaySales, dailyTarget);
}

export function mtdAchievementPct(mtdSales: number, mtdTarget: number): number | null {
  return pctRatio(mtdSales, mtdTarget);
}

export function remainingToTarget(mtdSales: number, mtdTarget: number): number {
  return Math.trunc(mtdTarget) - Math.trunc(mtdSales);
}

export function requiredDailyPace(
  mtdSales: number,
  mtdTarget: number,
  remainingDaysIncludingToday: number
): number | null {
  const rem = remainingToTarget(mtdSales, mtdTarget);
  if (rem <= 0) return 0;
  const days = Math.trunc(remainingDaysIncludingToday);
  if (!Number.isFinite(days) || days <= 0) return null;
  return Math.ceil(rem / days);
}

export function averageBasketSize(todaySales: number, transactions: number | null | undefined): number | null {
  const t = transactions == null ? null : Math.trunc(Number(transactions));
  if (t == null || t <= 0 || !Number.isFinite(todaySales)) return null;
  return Math.round(Math.trunc(todaySales) / t);
}

export function conversionRate(transactions: number | null | undefined, visitors: number | null | undefined): number | null {
  const tx = transactions == null ? null : Math.trunc(Number(transactions));
  const v = visitors == null ? null : Math.trunc(Number(visitors));
  if (v == null || v <= 0 || tx == null || tx < 0) return null;
  return Math.round((tx * 100) / v);
}

export function basicForecastEndOfMonth(mtdSales: number, elapsedDays: number, totalDaysInMonth: number): number | null {
  const mtd = Math.trunc(mtdSales);
  const elapsed = Math.trunc(elapsedDays);
  const total = Math.trunc(totalDaysInMonth);
  if (!Number.isFinite(mtd) || elapsed < 1 || total < 1) return null;
  return Math.round((mtd / elapsed) * total);
}

export function expectedMtdLinear(mtdTarget: number, elapsedDays: number, totalDaysInMonth: number): number | null {
  const target = Math.trunc(mtdTarget);
  const e = Math.trunc(elapsedDays);
  const t = Math.trunc(totalDaysInMonth);
  if (target < 0 || e < 1 || t < 1) return null;
  return Math.round((target * e) / t);
}

export type ComparisonSignal = 'good' | 'warning' | 'risk';

export function signalFromDeltaPct(deltaPct: number | null): ComparisonSignal {
  if (deltaPct == null || !Number.isFinite(deltaPct)) return 'warning';
  if (deltaPct >= 3) return 'good';
  if (deltaPct <= -5) return 'risk';
  return 'warning';
}

export function deltaAndPct(current: number, previous: number | null | undefined): { delta: number | null; deltaPct: number | null } {
  if (previous == null || !Number.isFinite(previous)) return { delta: null, deltaPct: null };
  const delta = Math.trunc(current) - Math.trunc(previous);
  if (previous === 0) {
    if (current === 0) return { delta: 0, deltaPct: 0 };
    return { delta, deltaPct: null };
  }
  const deltaPct = Math.round(((Math.trunc(current) - Math.trunc(previous)) * 100) / Math.abs(Math.trunc(previous)));
  return { delta, deltaPct };
}

export type RankedLine = {
  name: string;
  sales: number;
  target: number;
  achPct: number | null;
  contributionPct: number | null;
};

export function rankLines(
  rows: { name: string; salesSar: number; targetSar: number }[],
  totalSalesForContribution: number
): { top: RankedLine[]; low: RankedLine[] } {
  const total = Math.max(0, Math.trunc(totalSalesForContribution));
  const enriched: RankedLine[] = rows.map((r) => {
    const sales = Math.trunc(r.salesSar);
    const target = Math.trunc(r.targetSar);
    const achPct = pctRatio(sales, target);
    const contributionPct = total > 0 && sales >= 0 ? Math.round((sales * 100) / total) : null;
    return { name: r.name, sales, target, achPct, contributionPct };
  });
  const byAch = [...enriched].sort((a, b) => (b.achPct ?? -1) - (a.achPct ?? -1));
  const top = byAch.slice(0, 5);
  const low = [...enriched].sort((a, b) => (a.achPct ?? 999) - (b.achPct ?? 999)).slice(0, 5);
  return { top, low };
}

export function buildInsightLines(input: {
  dailyAchPct: number | null;
  mtdAchPct: number | null;
  reqPace: number | null;
  remToTarget: number;
  conv: number | null;
  basket: number | null;
  visitors: number | null;
  transactions: number | null;
  todayVsYesterdayDeltaPct: number | null;
  forecast: number | null;
  mtdTarget: number;
}): string[] {
  const lines: string[] = [];
  if (input.remToTarget > 0 && input.mtdAchPct != null && input.mtdAchPct < 90) {
    lines.push('Sales are behind the MTD target pace; focus on closing the remaining gap.');
  }
  if (input.todayVsYesterdayDeltaPct != null && input.todayVsYesterdayDeltaPct >= 3) {
    lines.push('Achievement is improving compared to yesterday.');
  }
  if (input.todayVsYesterdayDeltaPct != null && input.todayVsYesterdayDeltaPct <= -5) {
    lines.push('Today is tracking materially below yesterday — review staffing and conversion.');
  }
  if (
    input.visitors != null &&
    input.visitors > 0 &&
    input.conv != null &&
    input.conv < 25 &&
    input.visitors >= 30
  ) {
    lines.push('Conversion is weak despite meaningful traffic — review service flow and closing.');
  }
  if (
    input.transactions != null &&
    input.transactions > 0 &&
    input.basket != null &&
    input.basket > 0 &&
    input.transactions < 20
  ) {
    lines.push('Basket size is healthy but transaction count is low — drive more closes.');
  }
  if (input.forecast != null && input.forecast < input.mtdTarget && input.mtdTarget > 0) {
    lines.push('Linear forecast suggests end-of-month risk versus the monthly target.');
  }
  if (input.reqPace != null && input.reqPace > 0 && lines.length === 0) {
    lines.push('Required daily pace reflects remaining gap divided by days left in the month (including today).');
  }
  if (lines.length === 0) {
    lines.push('No strong risk signals from the current test metrics; add more inputs for richer conclusions.');
  }
  return lines.slice(0, 6);
}
