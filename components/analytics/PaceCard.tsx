'use client';

import type { PaceMetrics } from '@/lib/analytics/performanceLayer';
import { OpsCard } from '@/components/ui/OpsCard';
import { formatSarInt } from '@/lib/utils/money';

type Props = {
  title: string;
  pace: PaceMetrics;
  expectedLabel: string;
  bandLabels: { ahead: string; onTrack: string; behind: string };
  className?: string;
};

export function PaceCard({ title, pace, expectedLabel, bandLabels, className = '' }: Props) {
  const { band, paceDelta, expectedToDate, paceRatio } = pace;
  const cfg =
    band === 'ahead'
      ? {
          border: 'border-emerald-200',
          bg: 'bg-emerald-50/60',
          dot: 'bg-emerald-500',
          text: 'text-emerald-800',
          delta: 'text-emerald-700',
        }
      : band === 'behind'
        ? {
            border: 'border-red-200',
            bg: 'bg-red-50/60',
            dot: 'bg-red-500',
            text: 'text-red-800',
            delta: 'text-red-700',
          }
        : {
            border: 'border-amber-200',
            bg: 'bg-amber-50/60',
            dot: 'bg-amber-500',
            text: 'text-amber-900',
            delta: 'text-amber-800',
          };

  const bandLabel =
    band === 'ahead' ? bandLabels.ahead : band === 'behind' ? bandLabels.behind : bandLabels.onTrack;

  const deltaStr =
    paceDelta === 0
      ? formatSarInt(0)
      : paceDelta > 0
        ? `+${formatSarInt(paceDelta)}`
        : formatSarInt(paceDelta);

  const ratioStr =
    paceRatio != null && Number.isFinite(paceRatio) ? `${(paceRatio * 100).toFixed(0)}%` : '—';

  return (
    <OpsCard title={title} className={`border-2 ${cfg.border} ${cfg.bg} ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted">{expectedLabel}</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">
            {formatSarInt(expectedToDate)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${cfg.dot}`} aria-hidden />
          <span className={`text-sm font-semibold ${cfg.text}`}>{bandLabel}</span>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs text-muted">Δ vs expected</p>
          <p className={`mt-0.5 font-semibold tabular-nums ${cfg.delta}`}>{deltaStr}</p>
        </div>
        <div>
          <p className="text-xs text-muted">Pace ratio</p>
          <p className="mt-0.5 font-medium tabular-nums text-foreground">{ratioStr}</p>
        </div>
      </div>
    </OpsCard>
  );
}
