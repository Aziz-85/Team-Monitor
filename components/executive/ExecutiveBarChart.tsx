'use client';

import { CHART_AXIS_COLOR, CHART_AXIS_FONT_SIZE_SM } from '@/lib/chartStyles';

const CHART_EXECUTIVE_BAR = '#B8860B';

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
      <div
        style={{ height }}
        className="flex flex-col items-center justify-center gap-2 rounded-xl bg-neutral-50/50 text-center"
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
                fill={CHART_EXECUTIVE_BAR}
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
