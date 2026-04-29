import type { PerformanceHubPayload } from '@/lib/performance/hubEngine';

export type HubInsight = {
  id: string;
  severity: 'high' | 'medium' | 'low';
  params?: Record<string, number | string>;
};

export type HubInsightsInput = Omit<
  PerformanceHubPayload,
  'insights' | 'recommendations' | 'rankings'
>;

export function buildHubInsights(payload: HubInsightsInput): HubInsight[] {
  const insights: HubInsight[] = [];
  const { summary, entities, employees } = payload;

  if (summary.targetSales > 0 && summary.achievementPct < 75) {
    insights.push({
      id: 'low_achievement',
      severity: 'high',
      params: {
        achievementPct: summary.achievementPct,
        gapSales: summary.gapSales,
      },
    });
  }

  if (summary.actualSales > 0) {
    const hasInvoiceData =
      employees.some((e) => (e.totalInvoiceCount ?? 0) > 0) ||
      entities.some((e) => (e.productivity?.totalInvoiceCount ?? 0) > 0);

    if (!hasInvoiceData) {
      insights.push({
        id: 'missing_invoice_data',
        severity: 'medium',
      });
    }
  }

  if (employees.length > 0) {
    const lowUPT = employees.filter(
      (e) =>
        (e.totalInvoiceCount ?? 0) > 0 &&
        (e.unitsPerTransaction ?? 0) < 2
    );

    if (lowUPT.length > 0) {
      insights.push({
        id: 'low_upt',
        severity: 'medium',
        params: { count: lowUPT.length },
      });
    }
  }

  if (
    summary.achievementPct < 80 &&
    entities.some((e) => (e.productivity?.averageTicketSar ?? 0) > 500)
  ) {
    insights.push({
      id: 'high_ticket_low_achievement',
      severity: 'medium',
    });
  }

  if (entities.length > 1) {
    const max = Math.max(...entities.map((e) => e.achievementPct));
    const min = Math.min(...entities.map((e) => e.achievementPct));
    if (max - min > 20) {
      insights.push({
        id: 'performance_gap',
        severity: 'low',
        params: { diff: max - min },
      });
    }
  }

  return insights;
}
