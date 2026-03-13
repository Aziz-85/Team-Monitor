'use client';

/**
 * Canonical chart empty state — use for all chart components when data is empty.
 * Used by TargetVsActualLineChart, SimpleLineChart, SimpleBarChart, ExecutiveBarChart.
 */

type Props = {
  height?: number;
  minHeight?: number;
  emptyLabel?: string;
  /** 'default' | 'compact' — icon/text size; compact for executive theme */
  size?: 'default' | 'compact';
  /** 'default' = bg-neutral-50/50; 'bordered' = border + bg-surface-subtle/50 */
  variant?: 'default' | 'bordered';
  className?: string;
};

/** Bar chart icon (3 vertical bars) — shared across all chart empty states */
const CHART_ICON_PATH =
  'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z';

export function ChartEmptyState({
  height,
  minHeight,
  emptyLabel = 'No data yet',
  size = 'default',
  variant = 'default',
  className = '',
}: Props) {
  const iconSize = size === 'compact' ? 'h-8 w-8' : 'h-10 w-10';
  const textSize = size === 'compact' ? 'text-xs' : 'text-sm';
  const baseClass =
    variant === 'bordered'
      ? 'flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-surface-subtle/50 text-center'
      : 'flex flex-col items-center justify-center gap-2 rounded-xl bg-neutral-50/50 text-center';
  const containerClass = `${baseClass} ${className}`.trim();

  return (
    <div
      className={containerClass}
      style={{
        ...(height != null && { height }),
        ...(minHeight != null && { minHeight }),
      }}
    >
      <svg
        className={`${iconSize} text-muted/60`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d={CHART_ICON_PATH} />
      </svg>
      <p className={`font-medium text-muted ${textSize}`}>{emptyLabel}</p>
    </div>
  );
}
