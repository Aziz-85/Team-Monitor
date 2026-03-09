'use client';

import { SnapshotCard } from './SnapshotCard';
import { ProgressBar } from './ProgressBar';
import { formatSarInt } from '@/lib/utils/money';

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
          <span className="text-2xl font-semibold text-foreground">
            {formatSarInt(currentMonthActual)}
            <span className="ms-1 text-base font-normal text-muted">
              / {formatSarInt(currentMonthTarget)}
            </span>
          </span>
          <span
            className={`text-xl font-semibold ${
              variant === 'red'
                ? 'text-red-600'
                : variant === 'orange'
                  ? 'text-amber-600'
                  : 'text-foreground'
            }`}
          >
            {completionPct}%
          </span>
        </div>
        <ProgressBar valuePct={completionPct} variant={variant} />
        <p className="text-sm text-muted">
          Remaining gap: <strong>{formatSarInt(remainingGap)}</strong>
        </p>
      </div>
    </SnapshotCard>
  );
}
