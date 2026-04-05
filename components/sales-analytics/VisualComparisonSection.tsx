'use client';

import type { SalesAnalyticsPayload } from '@/lib/sales-analytics/types';
import { comparisonTitleKey } from '@/lib/sales-analytics/comparisonLabels';
import { VisualComparisonCard } from '@/components/sales-analytics/VisualComparisonCard';

export function VisualComparisonSection({
  comparisons,
  kpis,
  t,
}: {
  comparisons: SalesAnalyticsPayload['comparisons'];
  kpis: SalesAnalyticsPayload['kpis'];
  t: (key: string) => string;
}) {
  if (!comparisons.length) return null;

  return (
    <div className="mb-8">
      <h3 className="mb-3 text-sm font-semibold text-foreground">{t('salesAnalytics.visualCompareTitle')}</h3>
      <p className="mb-4 text-xs text-muted">{t('salesAnalytics.visualCompareHint')}</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {comparisons.map((c) => (
          <VisualComparisonCard key={c.id} comparison={c} kpis={kpis} title={t(comparisonTitleKey(c.id))} t={t} />
        ))}
      </div>
    </div>
  );
}
