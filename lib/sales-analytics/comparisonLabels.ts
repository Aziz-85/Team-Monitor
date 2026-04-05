/**
 * Shared labels/formatting for Sales Analytics comparison rows (text + visual).
 * Values come from API payloads only; helpers map them for presentation.
 */

import type { SalesAnalyticsComparison, SalesAnalyticsPayload } from '@/lib/sales-analytics/types';
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

/** Row labels for comparison tables/cards (same keys for text + visual blocks). */
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

/** Short subtitle under the main KPI inside the gauge (per comparison type). */
export function comparisonGaugeSubtitleKey(id: SalesAnalyticsComparison['id']): string {
  const m: Record<SalesAnalyticsComparison['id'], string> = {
    todayVsYesterday: 'salesAnalytics.visualGaugeSubYesterday',
    todayVsLastWeek: 'salesAnalytics.visualGaugeSubLastWeek',
    mtdVsLastMonthMtd: 'salesAnalytics.visualGaugeSubLastMonth',
    mtdActualVsTarget: 'salesAnalytics.visualGaugeSubAchievement',
    mtdActualVsPace: 'salesAnalytics.visualGaugeSubPace',
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

/** Arc fill 0–100: current as % of reference when reference &gt; 0. */
export function ratioFillPercent(current: number, reference: number | null): number | null {
  if (reference == null || !Number.isFinite(reference)) return null;
  if (reference === 0) {
    if (current === 0) return null;
    return 100;
  }
  const r = current / reference;
  if (!Number.isFinite(r)) return null;
  return Math.min(100, Math.max(0, Math.round(r * 100)));
}

export type VisualComparisonDerived = {
  arcFillPct: number | null;
  centerLabel: string;
  footnoteKey: string | null;
};

export function deriveVisualComparison(
  c: SalesAnalyticsComparison,
  kpis: SalesAnalyticsPayload['kpis']
): VisualComparisonDerived {
  const ref = c.reference;
  const cur = c.current;
  const fill = ratioFillPercent(cur, ref);

  let footnoteKey: string | null = null;
  if (ref == null) {
    footnoteKey = 'salesAnalytics.visualFootnoteNoRef';
  } else if (ref === 0 && cur === 0) {
    footnoteKey = 'salesAnalytics.visualFootnoteNeutral';
  } else if (ref === 0 && cur !== 0) {
    footnoteKey = 'salesAnalytics.visualFootnoteNoBaseline';
  }

  let centerLabel = '—';
  let arcFillPct = fill;

  switch (c.id) {
    case 'todayVsYesterday':
    case 'todayVsLastWeek':
    case 'mtdVsLastMonthMtd':
      centerLabel =
        c.deltaPct == null ? (fill != null ? `${fill}%` : '—') : `${c.deltaPct > 0 ? '+' : ''}${c.deltaPct}%`;
      if (footnoteKey == null && c.delta != null) {
        if (c.delta > 0) footnoteKey = 'salesAnalytics.visualFootnoteAboveRef';
        else if (c.delta < 0) footnoteKey = 'salesAnalytics.visualFootnoteBelowRef';
        else footnoteKey = 'salesAnalytics.visualFootnoteAtRef';
      }
      break;
    case 'mtdActualVsTarget': {
      const ach = kpis.mtdAchPct;
      centerLabel = `${ach}%`;
      arcFillPct = Math.min(100, Math.max(0, ach));
      if (ach >= 100) footnoteKey = 'salesAnalytics.visualFootnoteTargetMet';
      else if (ach >= 80) footnoteKey = 'salesAnalytics.visualFootnoteNearTarget';
      else footnoteKey = 'salesAnalytics.visualFootnoteBehindTarget';
      break;
    }
    case 'mtdActualVsPace':
      centerLabel =
        fill != null ? `${fill}%` : c.deltaPct == null ? '—' : `${c.deltaPct > 0 ? '+' : ''}${c.deltaPct}%`;
      arcFillPct = fill;
      if (footnoteKey == null && ref != null && ref > 0) {
        const ratio = cur / ref;
        if (ratio >= 1.05) footnoteKey = 'salesAnalytics.visualFootnoteAheadPace';
        else if (ratio >= 0.95) footnoteKey = 'salesAnalytics.visualFootnoteAtPace';
        else footnoteKey = 'salesAnalytics.visualFootnoteBehindPace';
      }
      break;
    default:
      break;
  }

  return { arcFillPct, centerLabel, footnoteKey };
}
