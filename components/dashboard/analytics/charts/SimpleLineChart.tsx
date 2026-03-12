'use client';

import { CHART_GRID_COLOR, CHART_ACTUAL_COLOR } from '@/lib/chartStyles';

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
      <div
        style={{ height }}
        className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-surface-subtle/50 text-center"
      >
        <svg
          className="h-8 w-8 text-muted/60"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75z"
          />
        </svg>
        <p className="text-xs font-medium text-muted">{emptyLabel}</p>
      </div>
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
