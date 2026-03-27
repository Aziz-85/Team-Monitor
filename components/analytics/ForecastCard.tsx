'use client';

import type { ForecastMetrics } from '@/lib/analytics/performanceLayer';
import { OpsCard } from '@/components/ui/OpsCard';
import { formatSarInt } from '@/lib/utils/money';

type Props = {
  title: string;
  linear: ForecastMetrics;
  rolling7: ForecastMetrics | null | undefined;
  disclaimer: string;
  rollingTitle: string;
  className?: string;
};

export function ForecastCard({
  title,
  linear,
  rolling7,
  disclaimer,
  rollingTitle,
  className = '',
}: Props) {
  const d = linear.forecastDelta;
  const deltaStr =
    d === 0 ? formatSarInt(0) : d > 0 ? `+${formatSarInt(d)}` : formatSarInt(d);
  const ratioPct =
    linear.forecastRatio != null && Number.isFinite(linear.forecastRatio)
      ? `${(linear.forecastRatio * 100).toFixed(0)}%`
      : '—';

  return (
    <OpsCard title={title} className={className}>
      <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-muted">{disclaimer}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs text-muted">Projected total</p>
          <p className="mt-0.5 text-xl font-semibold tabular-nums text-foreground">
            {formatSarInt(linear.forecastedTotal)}
          </p>
          <p className="mt-1 text-xs text-muted">
            Avg daily (actual pace): {formatSarInt(linear.avgDailyActual)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted">Vs target</p>
          <p className="mt-0.5 text-xl font-semibold tabular-nums text-foreground">{deltaStr}</p>
          <p className="mt-1 text-xs text-muted">Ratio {ratioPct}</p>
        </div>
      </div>
      {rolling7 != null && (
        <div className="mt-4 rounded-lg border border-border/80 bg-surface-subtle/50 p-3">
          <p className="text-xs font-medium text-foreground">{rollingTitle}</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
            {formatSarInt(rolling7.forecastedTotal)}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            Δ target:{' '}
            {rolling7.forecastDelta === 0
              ? formatSarInt(0)
              : rolling7.forecastDelta > 0
                ? `+${formatSarInt(rolling7.forecastDelta)}`
                : formatSarInt(rolling7.forecastDelta)}
          </p>
        </div>
      )}
    </OpsCard>
  );
}
