'use client';

/**
 * Shared target-vs-actual line chart abstraction.
 * Used by PerformanceLineChart (Home) and ExecutiveLineChart (Executive).
 * Theme prop controls colors and sizing; 0 stays at bottom; tooltips and labels preserved.
 */

import { useState, useCallback } from 'react';
import {
  CHART_ACTUAL_COLOR,
  CHART_ACTUAL_STROKE_WIDTH,
  CHART_TARGET_COLOR,
  CHART_TARGET_STROKE_WIDTH,
  CHART_TARGET_DASH_ARRAY,
  CHART_GRID_COLOR,
  CHART_GRID_STROKE_WIDTH,
  CHART_AXIS_COLOR,
  CHART_AXIS_FONT_SIZE,
  CHART_AXIS_FONT_SIZE_SM,
  CHART_EXECUTIVE_ACTUAL_COLOR,
  CHART_EXECUTIVE_TARGET_COLOR,
} from '@/lib/chartStyles';

export type TargetVsActualPoint = { label: string; value: number };

export type TargetVsActualTheme = 'home' | 'executive';

export type TargetVsActualLineChartProps = {
  data: TargetVsActualPoint[];
  targetLine?: number[];
  height?: number;
  valueFormat?: (n: number) => string;
  emptyLabel?: string;
  theme?: TargetVsActualTheme;
};

const THEME_CONFIG = {
  home: {
    actualColor: CHART_ACTUAL_COLOR,
    actualStrokeWidth: CHART_ACTUAL_STROKE_WIDTH,
    targetColor: CHART_TARGET_COLOR,
    targetStrokeWidth: CHART_TARGET_STROKE_WIDTH,
    axisFontSize: CHART_AXIS_FONT_SIZE,
    padding: { top: 24, right: 20, bottom: 36, left: 52 },
    width: 400,
    tooltipLabelPrefix: 'Day ',
    tooltipCompact: false,
  },
  executive: {
    actualColor: CHART_EXECUTIVE_ACTUAL_COLOR,
    actualStrokeWidth: 2.25,
    targetColor: CHART_EXECUTIVE_TARGET_COLOR,
    targetStrokeWidth: 1.5,
    axisFontSize: CHART_AXIS_FONT_SIZE_SM,
    padding: { top: 16, right: 12, bottom: 28, left: 44 },
    width: 320,
    tooltipLabelPrefix: '',
    tooltipCompact: true,
  },
};

export function TargetVsActualLineChart({
  data,
  targetLine,
  height = 240,
  valueFormat = (n) => n.toLocaleString(),
  emptyLabel = 'No sales data yet',
  theme = 'home',
}: TargetVsActualLineChartProps) {
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    index: number;
    label: string;
    actual: number;
    target?: number;
  } | null>(null);

  const cfg = THEME_CONFIG[theme];
  const { padding, width: w } = cfg;

  const values = data.map((d) => d.value);
  const targetValues = targetLine ?? [];
  const maxVal = Math.max(...values, ...targetValues, 1);
  const h = height - padding.top - padding.bottom;
  const xScale = (i: number) =>
    padding.left + (i / Math.max(1, data.length - 1)) * (w - padding.left - padding.right);
  const yScale = (v: number) => padding.top + h - (v / maxVal) * h;

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const svgX = ((e.clientX - rect.left) / rect.width) * w;
      let nearest = 0;
      let minDist = Infinity;
      for (let i = 0; i < data.length; i++) {
        const dist = Math.abs(xScale(i) - svgX);
        if (dist < minDist) {
          minDist = dist;
          nearest = i;
        }
      }
      const pt = data[nearest];
      const targetVal = targetLine?.[nearest];
      setTooltip({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        index: nearest,
        label: pt.label,
        actual: pt.value,
        target: targetVal,
      });
    },
    [data, targetLine, w, xScale]
  );

  const handleMouseLeave = useCallback(() => setTooltip(null), []);

  if (!data.length) {
    return (
      <div
        style={{ height }}
        className="flex flex-col items-center justify-center gap-2 rounded-xl bg-neutral-50/50 text-center"
      >
        <svg
          className={`${theme === 'home' ? 'h-10 w-10' : 'h-8 w-8'} text-muted/60`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
          />
        </svg>
        <p className={`font-medium text-muted ${theme === 'home' ? 'text-sm' : 'text-xs'}`}>{emptyLabel}</p>
      </div>
    );
  }

  const salesPath = data
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScale(d.value)}`)
    .join(' ');
  const targetPath =
    targetLine && targetLine.length === data.length
      ? targetLine
          .map((v, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScale(v)}`)
          .join(' ')
      : '';

  const labelTruncate = (label: string) =>
    label.length > (theme === 'home' ? 6 : 7) ? label.slice(-2) : label;

  return (
    <div className="relative w-full max-w-full overflow-hidden">
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${w} ${height}`}
        className="min-w-0"
        preserveAspectRatio="xMidYMid meet"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {Array.from({ length: 5 }).map((_, i) => {
          const y = padding.top + (h * (4 - i)) / 4;
          const v = Math.round((maxVal * i) / 4);
          return (
            <g key={i}>
              <line
                x1={padding.left}
                y1={y}
                x2={w - padding.right}
                y2={y}
                stroke={CHART_GRID_COLOR}
                strokeWidth={CHART_GRID_STROKE_WIDTH}
              />
              <text
                x={padding.left - (theme === 'home' ? 10 : 6)}
                y={y + 4}
                textAnchor="end"
                fill={CHART_AXIS_COLOR}
                fontSize={cfg.axisFontSize}
                className="tabular-nums"
              >
                {valueFormat(v)}
              </text>
            </g>
          );
        })}
        {data.map((d, i) => (
          <text
            key={i}
            x={xScale(i)}
            y={height - (theme === 'home' ? 10 : 8)}
            textAnchor="middle"
            fill={CHART_AXIS_COLOR}
            fontSize={cfg.axisFontSize - (theme === 'home' ? 1 : 0)}
          >
            {labelTruncate(d.label)}
          </text>
        ))}
        {targetPath ? (
          <path
            d={targetPath}
            fill="none"
            stroke={cfg.targetColor}
            strokeWidth={cfg.targetStrokeWidth}
            strokeDasharray={CHART_TARGET_DASH_ARRAY}
            opacity={theme === 'home' ? 0.85 : 0.9}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}
        <path
          d={salesPath}
          fill="none"
          stroke={cfg.actualColor}
          strokeWidth={cfg.actualStrokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {tooltip && (
          <circle
            cx={xScale(tooltip.index)}
            cy={yScale(tooltip.actual)}
            r={theme === 'home' ? 5 : 4}
            fill={cfg.actualColor}
            stroke="white"
            strokeWidth={theme === 'home' ? 2 : 1.5}
          />
        )}
      </svg>

      {tooltip && (
        <div
          className={`pointer-events-none absolute z-10 border border-border bg-surface shadow-lg ${
            cfg.tooltipCompact ? 'rounded-lg px-3 py-2' : 'rounded-xl px-4 py-3'
          }`}
          style={{
            left: Math.min(tooltip.x + (theme === 'home' ? 16 : 12), w - (theme === 'home' ? 140 : 120)),
            top: Math.min(tooltip.y + (theme === 'home' ? 16 : 12), height - (theme === 'home' ? 100 : 70)),
          }}
        >
          {cfg.tooltipLabelPrefix ? (
            <p
              className={`font-semibold uppercase tracking-wider text-muted ${
                cfg.tooltipCompact ? 'mb-1 text-[10px]' : 'mb-2 text-xs'
              }`}
            >
              {cfg.tooltipLabelPrefix}
              {tooltip.label}
            </p>
          ) : (
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
              {tooltip.label}
            </p>
          )}
          {cfg.tooltipCompact ? (
            <>
              <p className="text-xs font-semibold tabular-nums text-foreground">
                Actual: {valueFormat(tooltip.actual)}
              </p>
              {tooltip.target != null && (
                <p className="text-xs text-muted">Target: {valueFormat(tooltip.target)}</p>
              )}
            </>
          ) : (
            <div className="space-y-1 text-sm">
              <p className="flex items-center gap-2">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: cfg.actualColor }}
                />
                <span className="text-muted">Actual:</span>
                <span className="font-semibold tabular-nums text-foreground">
                  {valueFormat(tooltip.actual)}
                </span>
              </p>
              {tooltip.target != null && (
                <p className="flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-full border-2 border-dashed border-slate-400" />
                  <span className="text-muted">Target:</span>
                  <span className="font-semibold tabular-nums text-foreground">
                    {valueFormat(tooltip.target)}
                  </span>
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {(targetLine?.length ?? 0) > 0 && (
        <div
          className={`flex items-center text-muted ${
            theme === 'home' ? 'mt-4 gap-6 text-xs' : 'mt-3 gap-4 text-[10px]'
          }`}
        >
          <span className="flex items-center gap-2">
            <span
              className={`inline-block rounded ${theme === 'home' ? 'h-1.5 w-5' : 'h-1 w-4'}`}
              style={{ backgroundColor: cfg.actualColor }}
            />
            Actual
          </span>
          <span className="flex items-center gap-2">
            <span
              className={`inline-block rounded border border-dashed ${theme === 'home' ? 'h-1.5 w-5' : 'h-1 w-4'}`}
              style={{ borderColor: cfg.targetColor }}
            />
            Target
          </span>
        </div>
      )}
    </div>
  );
}
