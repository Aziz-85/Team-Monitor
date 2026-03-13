'use client';

import {
  CHART_AXIS_COLOR,
  CHART_AXIS_FONT_SIZE_SM,
  CHART_EXECUTIVE_ACTUAL_COLOR,
} from '@/lib/chartStyles';
import { ChartEmptyState } from '@/components/charts/ChartEmptyState';

type Point = { label: string; value: number };
type Props = {
  data: Point[];
  height?: number;
  valueFormat?: (n: number) => string;
  emptyLabel?: string;
};

export function ExecutiveBarChart({
  data,
  height = 180,
  valueFormat = (n) => n.toLocaleString(),
  emptyLabel = 'No data yet',
}: Props) {
  if (!data.length) {
    return (
      <ChartEmptyState
        height={height}
        emptyLabel={emptyLabel}
        size="compact"
      />
    );
  }

  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const padding = { top: 12, right: 12, bottom: 32, left: 40 };
  const w = 320;
  const barH = Math.max(14, (height - padding.top - padding.bottom - (data.length - 1) * 6) / data.length);
  const gap = 6;

  return (
    <div className="relative w-full max-w-full overflow-hidden">
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${w} ${height}`}
        className="min-w-0"
        preserveAspectRatio="xMidYMid meet"
      >
        {data.map((d, i) => {
          const y = padding.top + i * (barH + gap);
          const barW = (w - padding.left - padding.right) * (d.value / maxVal);
          return (
            <g key={i}>
              <rect
                x={padding.left}
                y={y}
                width={barW}
                height={barH}
                fill={CHART_EXECUTIVE_ACTUAL_COLOR}
                rx={3}
                opacity={0.9}
              />
              <text
                x={padding.left - 6}
                y={y + barH / 2 + 4}
                textAnchor="end"
                fill={CHART_AXIS_COLOR}
                fontSize={CHART_AXIS_FONT_SIZE_SM}
              >
                {d.label}
              </text>
              <text
                x={padding.left + barW + 6}
                y={y + barH / 2 + 4}
                textAnchor="start"
                fill={CHART_AXIS_COLOR}
                fontSize={CHART_AXIS_FONT_SIZE_SM}
                className="font-medium tabular-nums"
              >
                {valueFormat(d.value)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
