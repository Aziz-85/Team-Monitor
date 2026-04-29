import type { HubInsight, HubInsightsInput } from '@/lib/performance/hubInsights';

export type HubRecommendation = {
  id: string;
  relatedInsightId: string;
  severity?: 'high' | 'medium' | 'low';
  params?: Record<string, number | string>;
};

/**
 * Action items derived from hub insights. Uses the same numeric context as insights
 * (via `insight.params`); `payload` is available for future rules without extra queries.
 */
export function buildHubRecommendations(
  insights: HubInsight[],
  payload: HubInsightsInput
): HubRecommendation[] {
  void payload;
  const recommendations: HubRecommendation[] = [];

  for (const insight of insights) {
    if (insight.id === 'low_achievement') {
      recommendations.push({
        id: 'rec_review_pace',
        relatedInsightId: insight.id,
        severity: 'high',
        params: insight.params,
      });
    }

    if (insight.id === 'missing_invoice_data') {
      recommendations.push({
        id: 'rec_capture_sales_metrics',
        relatedInsightId: insight.id,
        severity: 'medium',
      });
    }

    if (insight.id === 'low_upt') {
      recommendations.push({
        id: 'rec_increase_basket_size',
        relatedInsightId: insight.id,
        severity: 'medium',
        params: insight.params,
      });
    }

    if (insight.id === 'high_ticket_low_achievement') {
      recommendations.push({
        id: 'rec_balance_ticket_and_conversion',
        relatedInsightId: insight.id,
        severity: 'medium',
      });
    }

    if (insight.id === 'performance_gap') {
      recommendations.push({
        id: 'rec_compare_operations',
        relatedInsightId: insight.id,
        severity: 'low',
        params: insight.params,
      });
    }
  }

  return recommendations;
}
