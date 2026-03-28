'use client';

import type { PaceMetrics } from '@/lib/analytics/performanceLayer';
import { OpsCard } from '@/components/ui/OpsCard';
import { formatSarInt } from '@/lib/utils/money';

type Props = {
  title: string;
  pace: PaceMetrics;
  /** e.g. "Expected by today" (linear MTD expectation) */
  expectedLabel: string;
  /** e.g. "Actual (MTD)" */
  actualMtdLabel: string;
  /** e.g. "Delta vs expected" */
  deltaLabel: string;
  bandLabels: { ahead: string; onTrack: string; behind: string };
  className?: string;
};

export function PaceCard({
  title,
  pace,
  expectedLabel,
  actualMtdLabel,
  deltaLabel,
  bandLabels,
  className = '',
}: Props) {
  const { band, paceDelta, expectedToDate } = pace;
  const actualMtd = expectedToDate + paceDelta;

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
            border: 'border-slate-200',
            bg: 'bg-slate-50/70',
            dot: 'bg-slate-400',
            text: 'text-slate-800',
            delta: 'text-slate-700',
          };

  const bandLabel =
    band === 'ahead' ? bandLabels.ahead : band === 'behind' ? bandLabels.behind : bandLabels.onTrack;

  const deltaStr =
    paceDelta === 0
      ? formatSarInt(0)
      : paceDelta > 0
        ? `+${formatSarInt(paceDelta)}`
        : formatSarInt(paceDelta);

  return (
    <OpsCard title={title} className={`border-2 ${cfg.border} ${cfg.bg} ${className}`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <span className={`inline-flex items-center gap-2 text-sm font-semibold ${cfg.text}`}>
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${cfg.dot}`} aria-hidden />
          {bandLabel}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <p className="text-xs text-muted">{expectedLabel}</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-foreground md:text-xl">
            {formatSarInt(expectedToDate)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted">{actualMtdLabel}</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-foreground md:text-xl">
            {formatSarInt(actualMtd)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted">{deltaLabel}</p>
          <p className={`mt-1 text-lg font-semibold tabular-nums md:text-xl ${cfg.delta}`}>{deltaStr}</p>
        </div>
      </div>
    </OpsCard>
  );
}
