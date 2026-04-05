/**
 * Shared labels/formatting for Sales Analytics Key comparisons (text cards).
 * Values come from API payloads only.
 */

import type { SalesAnalyticsComparison } from '@/lib/sales-analytics/types';
import { formatSarInt } from '@/lib/utils/money';

export function comparisonTitleKey(id: SalesAnalyticsComparison['id']): string {
  const keys: Record<SalesAnalyticsComparison['id'], string> = {
    todayVsYesterday: 'salesAnalytics.cmpTodayVsYesterday',
    todayVsLastWeek: 'salesAnalytics.cmpTodayVsWeek',
    mtdVsLastMonthMtd: 'salesAnalytics.cmpMtdVsLastMonth',
    mtdActualVsTarget: 'salesAnalytics.cmpMtdVsTarget',
    mtdActualVsPace: 'salesAnalytics.cmpMtdVsPace',
  };
  return keys[id];
}

/** Row labels for comparison cards (Today / Yesterday / MTD actual / …). */
export function comparisonRowLabelKeys(id: SalesAnalyticsComparison['id']): { currentKey: string; refKey: string } {
  const m: Record<SalesAnalyticsComparison['id'], { currentKey: string; refKey: string }> = {
    todayVsYesterday: { currentKey: 'salesAnalytics.rowToday', refKey: 'salesAnalytics.rowYesterday' },
    todayVsLastWeek: { currentKey: 'salesAnalytics.rowToday', refKey: 'salesAnalytics.rowSameDayLastWeek' },
    mtdVsLastMonthMtd: { currentKey: 'salesAnalytics.rowMtd', refKey: 'salesAnalytics.rowLastMonthSamePhase' },
    mtdActualVsTarget: { currentKey: 'salesAnalytics.rowMtdActual', refKey: 'salesAnalytics.rowMonthlyTarget' },
    mtdActualVsPace: { currentKey: 'salesAnalytics.rowMtdActual', refKey: 'salesAnalytics.rowExpectedPace' },
  };
  return m[id];
}

export function formatComparisonAmounts(c: SalesAnalyticsComparison): {
  currentFmt: string;
  refFmt: string;
  deltaFmt: string;
  deltaPctFmt: string;
} {
  return {
    currentFmt: formatSarInt(c.current),
    refFmt: c.reference == null ? '—' : formatSarInt(c.reference),
    deltaFmt: c.delta == null ? '—' : formatSarInt(c.delta),
    deltaPctFmt: c.deltaPct == null ? '—' : `${c.deltaPct > 0 ? '+' : ''}${c.deltaPct}%`,
  };
}
