'use client';

import { CHART_GRID_COLOR, CHART_ACTUAL_COLOR } from '@/lib/chartStyles';
import { ChartEmptyState } from '@/components/charts/ChartEmptyState';

type Point = { label: string; value: number };

type Props = {
  data: Point[];
  height?: number;
  valueFormat?: (n: number) => string;
  emptyLabel?: string;
};

/** Zero at bottom, higher values higher. Clean minimal line chart for analytics. */
export function SimpleLineChart({
  data,
  height = 200,
  valueFormat = (n) => n.toLocaleString(),
  emptyLabel = 'No sales data yet',
}: Props) {
  if (data.length === 0) {
    return (
      <ChartEmptyState
        height={height}
        emptyLabel={emptyLabel}
        size="compact"
        variant="bordered"
      />
    );
  }

  const values = data.map((d) => d.value);
  const maxVal = Math.max(...values, 1);
  const padding = { top: 16, right: 16, bottom: 28, left: 48 };
  const w = 400;
  const h = height - padding.top - padding.bottom;

  const xScale = (i: number) =>
    padding.left + (i / Math.max(1, data.length - 1)) * (w - padding.left - padding.right);
  const yScale = (v: number) => padding.top + h - (v / maxVal) * h;

  const pts = data.map((d, i) => `${xScale(i)},${yScale(d.value)}`);
  const path = `M ${pts.join(' L ')}`;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface-subtle/50">
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${w} ${height}`}
        className="min-w-0"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Subtle horizontal grid */}
        {Array.from({ length: 4 }).map((_, i) => {
          const y = padding.top + (h * (3 - i)) / 3;
          const v = Math.round((maxVal * (i + 1)) / 4);
          return (
            <g key={i}>
              <line
                x1={padding.left}
                y1={y}
                x2={w - padding.right}
                y2={y}
                stroke={CHART_GRID_COLOR}
                strokeWidth={1}
              />
              <text
                x={padding.left - 6}
                y={y + 4}
                textAnchor="end"
                fill="#64748b"
                fontSize={10}
                className="tabular-nums"
              >
                {valueFormat(v)}
              </text>
            </g>
          );
        })}
        <path
          d={path}
          fill="none"
          stroke={CHART_ACTUAL_COLOR}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
