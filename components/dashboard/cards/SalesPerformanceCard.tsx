'use client';

import { SnapshotCard } from './SnapshotCard';
import { ProgressBar } from './ProgressBar';
import { formatSarFromHalala } from '@/lib/utils/money';

type Props = {
  currentMonthTarget: number;
  currentMonthActual: number;
  completionPct: number;
  remainingGap: number;
};

export function SalesPerformanceCard({
  currentMonthTarget,
  currentMonthActual,
  completionPct,
  remainingGap,
}: Props) {
  const variant =
    completionPct < 40 ? 'red' : completionPct < 60 ? 'orange' : 'default';

  return (
    <SnapshotCard title="Monthly Sales Performance">
      <div className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-2xl font-semibold text-slate-900">
            {formatSarFromHalala(currentMonthActual)}
            <span className="ml-1 text-base font-normal text-slate-500">
              / {formatSarFromHalala(currentMonthTarget)}
            </span>
          </span>
          <span
            className={`text-xl font-semibold ${
              variant === 'red'
                ? 'text-red-600'
                : variant === 'orange'
                  ? 'text-amber-600'
                  : 'text-slate-900'
            }`}
          >
            {completionPct}%
          </span>
        </div>
        <ProgressBar valuePct={completionPct} variant={variant} />
        <p className="text-sm text-slate-600">
          Remaining gap: <strong>{formatSarFromHalala(remainingGap)}</strong>
        </p>
      </div>
    </SnapshotCard>
  );
}
