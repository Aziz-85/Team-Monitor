'use client';

import { CHART_SPARKLINE_STROKE_WIDTH, CHART_SPARKLINE_OPACITY } from '@/lib/chartStyles';

type Props = {
  values: number[];
  height?: number;
  className?: string;
  strokeColor?: string;
};

/** Minimal sparkline for KPI cards. Zero at bottom, higher values higher. No axes, no clutter. */
export function MiniSparkline({
  values,
  height = 32,
  className = '',
  strokeColor = 'currentColor',
}: Props) {
  if (values.length < 2) return null;

  const w = 80;
  const h = height - 4;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * (w - 4) + 2;
    const y = h - (v / max) * (h - 4) + 2;
    return `${x},${y}`;
  });
  const path = `M ${pts.join(' L ')}`;

  return (
    <svg
      width={w}
      height={height}
      className={`overflow-visible ${className}`}
      preserveAspectRatio="none"
    >
      <path
        d={path}
        fill="none"
        stroke={strokeColor}
        strokeWidth={CHART_SPARKLINE_STROKE_WIDTH}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ opacity: CHART_SPARKLINE_OPACITY }}
      />
    </svg>
  );
}
