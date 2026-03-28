'use client';

import type { ReactNode } from 'react';
import { CardShell } from '@/components/dashboard/cards/CardShell';
import { getPerformanceBgClass } from '@/lib/performanceColors';

export type PerformanceKpiCardProps = {
  title: string;
  subtitle?: string;
  mainValue: string;
  mainValueLabel?: string;
  /** Content directly under value (e.g. "Target X") — minimal gap */
  valueSuffix?: ReactNode;
  /** Slot for target/remaining (between value and progress) */
  metricsSlot?: ReactNode;
  /** Slot after progress bar (e.g. "Remaining X") */
  metricsAfterProgress?: ReactNode;
  percent: number;
  /** Hide ring/bar when the day is not yet a completed business day (no SalesEntry for today). */
  hideAchievementProgress?: boolean;
  /** Shown under the value row when progress is hidden */
  progressPendingHint?: string;
  /** Show percent as text before progress bar (Sales Summary style) */
  showPercentInline?: boolean;
  headerSlot?: ReactNode;
  leadingSlot?: ReactNode;
  /** 'default' = p-6; 'compact' = p-5 */
  variant?: 'default' | 'compact';
  /** Progress bar height: 'sm' = h-1.5, 'md' = h-2 */
  progressBarSize?: 'sm' | 'md';
  className?: string;
};

/**
 * Canonical operational KPI base — target/achievement performance display.
 * Used by LuxuryPerformanceCard and Sales Summary KPI cards.
 * For executive KPIs use ExecutiveKpiCard instead.
 * Composable: headerSlot (sparkline), leadingSlot (circular ring), metricsSlot (target/remaining).
 */
export function PerformanceKpiCard({
  title,
  subtitle,
  mainValue,
  mainValueLabel,
  valueSuffix,
  metricsSlot,
  metricsAfterProgress,
  percent,
  hideAchievementProgress = false,
  progressPendingHint,
  showPercentInline = false,
  headerSlot,
  leadingSlot,
  variant = 'default',
  progressBarSize = 'sm',
  className = '',
}: PerformanceKpiCardProps) {
  const bgClass = getPerformanceBgClass(percent);
  const paddingClass = variant === 'compact' ? '!p-5' : '';
  const progressHeight = progressBarSize === 'sm' ? 'h-1.5' : 'h-2';

  return (
    <CardShell variant="luxury" className={`${paddingClass} ${className}`.trim()}>
      <div className="mb-4 flex items-start justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted">{title}</p>
          {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
        </div>
        {headerSlot}
      </div>

      <div className={`flex items-start gap-5 ${leadingSlot && !hideAchievementProgress ? '' : 'flex-col'}`}>
        {!hideAchievementProgress ? leadingSlot : null}
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="text-2xl font-bold tabular-nums text-foreground md:text-3xl">{mainValue}</p>
            {mainValueLabel && <p className="mt-0.5 text-xs text-muted">{mainValueLabel}</p>}
            {valueSuffix}
          </div>

          {metricsSlot}

          {hideAchievementProgress && progressPendingHint && (
            <p className="text-sm text-muted">{progressPendingHint}</p>
          )}

          {showPercentInline && !hideAchievementProgress && (
            <p className="text-sm font-bold tabular-nums">{Math.round(percent)}%</p>
          )}

          {!hideAchievementProgress && (
            <div className={`w-full overflow-hidden rounded-full bg-surface-subtle ${progressHeight}`}>
              <div
                className={`h-full rounded-full transition-all duration-500 ${bgClass}`}
                style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
              />
            </div>
          )}

          {metricsAfterProgress}
        </div>
      </div>
    </CardShell>
  );
}
