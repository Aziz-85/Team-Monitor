'use client';

import { formatSarInt } from '@/lib/utils/money';
import { getPerformanceColorClasses } from '@/lib/performanceColors';
import { MiniSparkline } from './MiniSparkline';
import { PerformanceKpiCard } from '@/components/ui/PerformanceKpiCard';

type Props = {
  title: string;
  subtitle?: string;
  /** Label before target amount (e.g. "Required to stay on track"). */
  targetLineLabel?: string;
  /** Label before remaining/gap (e.g. "Gap vs required pace"). */
  remainingLineLabel?: string;
  target: number;
  sales: number;
  remaining: number;
  percent: number;
  sparklineValues?: number[];
  hideAchievementProgress?: boolean;
  progressPendingHint?: string;
};

function CircularPercentRing({ percent }: { percent: number }) {
  const colors = getPerformanceColorClasses(percent);
  const size = 72;
  const stroke = 6;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const barWidth = Math.min(100, Math.max(0, percent));
  const offset = circumference - (barWidth / 100) * circumference;

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-neutral-100"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={`${colors.ring} transition-all duration-500`}
        />
      </svg>
      <span
        className={`absolute inset-0 flex items-center justify-center text-sm font-bold tabular-nums ${colors.text}`}
      >
        {Math.round(percent)}%
      </span>
    </div>
  );
}

export function LuxuryPerformanceCard({
  title,
  subtitle,
  targetLineLabel = 'Target',
  remainingLineLabel = 'Remaining',
  target,
  sales,
  remaining,
  percent,
  sparklineValues,
  hideAchievementProgress = false,
  progressPendingHint,
}: Props) {
  return (
    <PerformanceKpiCard
      title={title}
      subtitle={subtitle}
      mainValue={formatSarInt(sales)}
      valueSuffix={
        <p className="mt-0.5 text-xs text-muted">
          {targetLineLabel} {formatSarInt(target)}
        </p>
      }
      metricsAfterProgress={
        <p className="text-xs text-muted">
          {remainingLineLabel}{' '}
          <span className="font-semibold tabular-nums text-foreground">{formatSarInt(remaining)}</span>
        </p>
      }
      percent={percent}
      hideAchievementProgress={hideAchievementProgress}
      progressPendingHint={progressPendingHint}
      headerSlot={
        sparklineValues && sparklineValues.length >= 2 ? (
          <MiniSparkline values={sparklineValues} height={28} className="text-muted" />
        ) : undefined
      }
      leadingSlot={hideAchievementProgress ? undefined : <CircularPercentRing percent={percent} />}
      progressBarSize="sm"
    />
  );
}
