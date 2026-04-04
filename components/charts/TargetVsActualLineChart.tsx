'use client';

/**
 * Canonical target-vs-actual line chart — use for all target/actual line charts.
 * Used by PerformanceLineChart (Home), ExecutiveLineChart (Executive), SalesSummaryClient.
 * Theme prop controls colors and sizing; 0 stays at bottom; tooltips and labels preserved.
 * Optional `reportingChrome`: calendar-based X (day-of-month vs month length), round SAR Y-axis,
 * and linear segments (no curve overshoot) for cumulative posted vs reporting target.
 */

import { useState, useCallback, useEffect, useRef, useId, useMemo } from 'react';
import { ChartEmptyState } from './ChartEmptyState';
import { formatSarInt } from '@/lib/utils/money';
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

/** UI-only labels + context for Team Monitor “reporting cumulative” chart */
export type TargetVsActualReportingChrome = {
  dateKeys: string[];
  /** Calendar days in month — used to place “today” when today has no trajectory point yet. */
  daysInMonth: number;
  /** Selected `YYYY-MM` (must match Riyadh “today” month for today line). */
  monthKey: string;
  postedLastRecordedDateKey: string | null;
  todayInSelectedMonth: boolean;
  labels: {
    kpiAheadBy: (formattedVariance: string) => string;
    kpiBehindBy: (formattedVariance: string) => string;
    targetReachedOnDay: (day: number) => string;
    lastRecordedDay: string;
    todayNotPosted: string;
    statusAhead: string;
    statusBehind: string;
    legendActual: string;
    legendTarget: string;
    dayLine: (day: number) => string;
    tooltipActual: string;
    tooltipTarget: string;
    tooltipVariance: string;
    tooltipStatus: string;
  };
};

export type TargetVsActualLineChartProps = {
  data: TargetVsActualPoint[];
  targetLine?: number[];
  height?: number;
  valueFormat?: (n: number) => string;
  emptyLabel?: string;
  theme?: TargetVsActualTheme;
  /** When set, enables compact Y-axis, fills, markers, KPI strip, and rich tooltip (Team Monitor). */
  reportingChrome?: TargetVsActualReportingChrome;
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

function formatCompactAxisSar(sar: number): string {
  const n = Math.round(Math.abs(Number(sar)));
  const sign = sar < 0 ? '-' : '';
  if (n >= 1_000_000) return `${sign}${Math.round(n / 1_000_000)}M SAR`;
  if (n >= 1_000) return `${sign}${Math.round(n / 1_000)}K SAR`;
  return `${sign}${n} SAR`;
}

/** Round step for “nice” Y-axis ticks (integer SAR, same domain as SalesEntry / targets). */
function niceStepForAxis(range: number): number {
  if (!Number.isFinite(range) || range <= 0) return 1;
  const exp = Math.floor(Math.log10(range));
  const pow = 10 ** exp;
  const f = range / pow;
  let nf: number;
  if (f < 1.5) nf = 1;
  else if (f < 3) nf = 2;
  else if (f < 7) nf = 5;
  else nf = 10;
  return nf * pow;
}

/** Ceiling axis max so 5 ticks (0 … max) land on round SAR increments. */
function reportingAxisMaxSar(rawMax: number): number {
  if (!Number.isFinite(rawMax) || rawMax <= 0) return 1;
  const step = niceStepForAxis(rawMax / 4);
  return Math.max(step, Math.ceil(rawMax / step) * step);
}

function formatSignedSar(sar: number): string {
  const sign = sar >= 0 ? '+' : '-';
  const core = formatSarInt(Math.abs(sar)).replace(/\s*SAR\s*$/i, '').trim();
  return `${sign}${core} SAR`;
}

function dayOfMonthFromDateKey(dateKey: string): number {
  const p = dateKey.split('-');
  const d = parseInt(p[p.length - 1] ?? '0', 10);
  return Number.isFinite(d) ? d : 0;
}

function riyadhTodayDateKey(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

type Crossover = { svgX: number; svgY: number; dayNum: number; endIndex: number };

function findCrossoverFromBelow(
  actual: number[],
  target: number[],
  xScale: (i: number) => number,
  yScale: (v: number) => number,
  dayNumAt: (i: number) => number
): Crossover | null {
  for (let i = 1; i < actual.length; i++) {
    const a0 = actual[i - 1];
    const t0 = target[i - 1];
    const a1 = actual[i];
    const t1 = target[i];
    const below0 = a0 < t0 - 1e-6;
    const atOrAbove1 = a1 >= t1 - 1e-6;
    if (below0 && atOrAbove1) {
      const da = a1 - a0;
      const dt = t1 - t0;
      const den = da - dt;
      let s = 1;
      if (Math.abs(den) > 1e-9) s = (t0 - a0) / den;
      s = Math.max(0, Math.min(1, s));
      const ac = a0 + s * da;
      const svgX = xScale(i - 1) + s * (xScale(i) - xScale(i - 1));
      const svgY = yScale(ac);
      const d0 = dayNumAt(i - 1);
      const d1 = dayNumAt(i);
      const dayNum = Math.max(1, Math.round(d0 + s * (d1 - d0)));
      return { svgX, svgY, dayNum, endIndex: i };
    }
  }
  return null;
}

export function TargetVsActualLineChart({
  data,
  targetLine,
  height = 240,
  valueFormat = (n) => n.toLocaleString(),
  emptyLabel = 'No sales data yet',
  theme = 'home',
  reportingChrome,
}: TargetVsActualLineChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const clipUid = useId().replace(/:/g, '');
  const [homeContainerWidth, setHomeContainerWidth] = useState(0);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    index: number;
    label: string;
    actual: number;
    target?: number;
  } | null>(null);

  const cfg = THEME_CONFIG[theme];
  const { padding } = cfg;
  const w = theme === 'home' && homeContainerWidth > 0 ? homeContainerWidth : cfg.width;
  const reporting = Boolean(reportingChrome && targetLine && targetLine.length === data.length);

  useEffect(() => {
    if (theme !== 'home') return;
    const el = containerRef.current;
    if (!el) return;
    const update = () => setHomeContainerWidth(el.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [theme]);

  const values = data.map((d) => d.value);
  const targetValues = targetLine ?? [];
  const rawMax = Math.max(...values, ...targetValues, 1);
  const chartYMax = reporting ? reportingAxisMaxSar(rawMax) : rawMax;
  const h = height - padding.top - padding.bottom;
  const innerW = w - padding.left - padding.right;

  const dayNumAt = useCallback(
    (i: number) => {
      const key = reportingChrome?.dateKeys[i];
      if (key) return dayOfMonthFromDateKey(key);
      return i + 1;
    },
    [reportingChrome?.dateKeys]
  );

  const xScale = useCallback(
    (i: number) => {
      if (reporting && reportingChrome && reportingChrome.dateKeys.length > 0) {
        const dm = Math.max(2, reportingChrome.daysInMonth);
        const dom = dayNumAt(i);
        if (data.length === 1) {
          return padding.left + innerW / 2;
        }
        return padding.left + ((dom - 1) / Math.max(1, dm - 1)) * innerW;
      }
      return padding.left + (i / Math.max(1, data.length - 1)) * innerW;
    },
    [
      reporting,
      reportingChrome,
      data.length,
      dayNumAt,
      padding.left,
      innerW,
    ]
  );

  const yScale = useCallback(
    (v: number) => padding.top + h - (v / chartYMax) * h,
    [padding.top, h, chartYMax]
  );

  const crossover = useMemo((): Crossover | null => {
    if (!reporting || !targetLine || targetLine.length !== data.length) return null;
    const actual = data.map((d) => d.value);
    const hInner = height - padding.top - padding.bottom;
    const xS = (i: number) => xScale(i);
    const yS = (v: number) => padding.top + hInner - (v / chartYMax) * hInner;
    return findCrossoverFromBelow(actual, targetLine, xS, yS, dayNumAt);
  }, [reporting, targetLine, data, xScale, chartYMax, height, padding.top, padding.bottom, dayNumAt]);

  const lastRecordedIdx = useMemo(() => {
    if (!reportingChrome?.postedLastRecordedDateKey) return -1;
    return reportingChrome.dateKeys.findIndex((k) => k === reportingChrome.postedLastRecordedDateKey);
  }, [reportingChrome?.postedLastRecordedDateKey, reportingChrome?.dateKeys]);

  const riyadhTodayKey = useMemo(() => riyadhTodayDateKey(), []);

  const todayLineX = useMemo(() => {
    if (!reporting || !reportingChrome) return null;
    if (!reportingChrome.todayInSelectedMonth) return null;
    const tk = riyadhTodayKey;
    if (reportingChrome.postedLastRecordedDateKey === tk) return null;
    if (tk.slice(0, 7) !== reportingChrome.monthKey) return null;
    const dom = dayOfMonthFromDateKey(tk);
    const dm = Math.max(2, reportingChrome.daysInMonth);
    const inner = w - padding.left - padding.right;
    const x = padding.left + ((dom - 1) / Math.max(1, dm - 1)) * inner;
    return Number.isFinite(x) ? x : null;
  }, [reporting, reportingChrome, riyadhTodayKey, w, padding.left, padding.right]);

  const showTodayLine = todayLineX != null;

  const kpiVarianceIdx = useMemo(() => {
    if (!data.length) return -1;
    if (lastRecordedIdx >= 0) return lastRecordedIdx;
    return data.length - 1;
  }, [data.length, lastRecordedIdx]);

  const kpiVariance =
    kpiVarianceIdx >= 0 && targetLine && targetLine[kpiVarianceIdx] != null
      ? data[kpiVarianceIdx]!.value - targetLine[kpiVarianceIdx]!
      : null;

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
      <ChartEmptyState
        height={height}
        emptyLabel={emptyLabel}
        size={theme === 'home' ? 'default' : 'compact'}
      />
    );
  }

  const salesPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScale(d.value)}`).join(' ');
  const targetPath =
    targetLine && targetLine.length === data.length
      ? targetLine.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScale(v)}`).join(' ')
      : '';

  const labelTruncate = (label: string) =>
    label.length > (theme === 'home' ? 6 : 7) ? label.slice(-2) : label;

  const axisTickFormatter = reporting ? formatCompactAxisSar : valueFormat;
  const gridStroke = reporting ? 'rgba(148, 163, 184, 0.22)' : CHART_GRID_COLOR;
  const gridStrokeW = reporting ? 1 : CHART_GRID_STROKE_WIDTH;

  const actualStrokeW = reporting ? Math.max(cfg.actualStrokeWidth, 3) : cfg.actualStrokeWidth;
  const targetStrokeW = cfg.targetStrokeWidth;
  const targetColorReporting = reporting ? 'rgba(100, 116, 139, 0.75)' : cfg.targetColor;

  const clipRect = {
    x: padding.left,
    y: padding.top,
    width: w - padding.left - padding.right,
    height: h,
  };

  const segmentFills =
    reporting && targetLine && targetLine.length === data.length
      ? data.map((d, i) => {
          if (i >= data.length - 1) return null;
          const x0 = xScale(i);
          const x1 = xScale(i + 1);
          const ya0 = yScale(d.value);
          const ya1 = yScale(data[i + 1]!.value);
          const yt0 = yScale(targetLine[i]!);
          const yt1 = yScale(targetLine[i + 1]!);
          const ahead = (d.value + data[i + 1]!.value) / 2 >= (targetLine[i]! + targetLine[i + 1]!) / 2;
          const fill = ahead ? 'rgba(16, 185, 129, 0.14)' : 'rgba(239, 68, 68, 0.12)';
          const pts = `${x0},${ya0} ${x1},${ya1} ${x1},${yt1} ${x0},${yt0}`;
          return <polygon key={`seg-${i}`} points={pts} fill={fill} stroke="none" />;
        })
      : null;

  return (
    <div ref={containerRef} className="relative w-full min-w-0 max-w-full overflow-hidden">
      {reporting && reportingChrome && kpiVariance != null && (
        <p
          className={`mb-3 text-sm font-semibold tabular-nums ${
            kpiVariance >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'
          }`}
        >
          {kpiVariance >= 0
            ? reportingChrome.labels.kpiAheadBy(formatSignedSar(kpiVariance))
            : reportingChrome.labels.kpiBehindBy(formatSignedSar(kpiVariance))}
        </p>
      )}
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${w} ${height}`}
        className="min-w-0"
        preserveAspectRatio="xMidYMid meet"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <defs>
          <clipPath id={`clip-${clipUid}`}>
            <rect x={clipRect.x} y={clipRect.y} width={clipRect.width} height={clipRect.height} />
          </clipPath>
        </defs>
        {Array.from({ length: 5 }).map((_, i) => {
          const y = padding.top + (h * (4 - i)) / 4;
          const v = Math.round((chartYMax * i) / 4);
          return (
            <g key={i}>
              <line
                x1={padding.left}
                y1={y}
                x2={w - padding.right}
                y2={y}
                stroke={gridStroke}
                strokeWidth={gridStrokeW}
              />
              <text
                x={padding.left - (theme === 'home' ? 10 : 6)}
                y={y + 4}
                textAnchor="end"
                fill={CHART_AXIS_COLOR}
                fontSize={cfg.axisFontSize}
                className="tabular-nums"
              >
                {axisTickFormatter(v)}
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
        {showTodayLine && todayLineX != null ? (
          <g>
            <line
              x1={todayLineX}
              y1={padding.top}
              x2={todayLineX}
              y2={padding.top + h}
              stroke="rgba(148, 163, 184, 0.35)"
              strokeWidth={1}
              strokeDasharray="3 4"
            />
            <text
              x={todayLineX + 4}
              y={padding.top + 11}
              fill={CHART_AXIS_COLOR}
              fontSize={Math.max(9, cfg.axisFontSize - 2)}
              className="tabular-nums"
            >
              {reportingChrome!.labels.todayNotPosted}
            </text>
          </g>
        ) : null}
        <g clipPath={`url(#clip-${clipUid})`}>{segmentFills}</g>
        {targetPath ? (
          <path
            d={targetPath}
            fill="none"
            stroke={targetColorReporting}
            strokeWidth={targetStrokeW}
            strokeDasharray={CHART_TARGET_DASH_ARRAY}
            opacity={reporting ? 0.95 : theme === 'home' ? 0.85 : 0.9}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}
        <path
          d={salesPath}
          fill="none"
          stroke={cfg.actualColor}
          strokeWidth={actualStrokeW}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {crossover && reportingChrome ? (
          <g>
            <circle cx={crossover.svgX} cy={crossover.svgY} r={6} fill={cfg.actualColor} opacity={0.95} />
            <circle cx={crossover.svgX} cy={crossover.svgY} r={9} fill="none" stroke="white" strokeWidth={2} />
            <title>{reportingChrome.labels.targetReachedOnDay(crossover.dayNum)}</title>
          </g>
        ) : null}
        {reporting && lastRecordedIdx >= 0 && reportingChrome ? (
          <g>
            <circle
              cx={xScale(lastRecordedIdx)}
              cy={yScale(data[lastRecordedIdx]!.value)}
              r={5.5}
              fill={cfg.actualColor}
              stroke="#fff"
              strokeWidth={2}
            />
            <text
              x={xScale(lastRecordedIdx)}
              y={yScale(data[lastRecordedIdx]!.value) - 12}
              textAnchor="middle"
              fill={CHART_AXIS_COLOR}
              fontSize={Math.max(9, cfg.axisFontSize - 2)}
            >
              {reportingChrome.labels.lastRecordedDay}
            </text>
          </g>
        ) : null}
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
          } ${reporting ? 'min-w-[200px] max-w-[280px]' : ''}`}
          style={{
            left: Math.min(tooltip.x + (theme === 'home' ? 16 : 12), w - (theme === 'home' ? 140 : 120)),
            top: Math.min(tooltip.y + (theme === 'home' ? 16 : 12), height - (theme === 'home' ? 100 : 70)),
          }}
        >
          {reporting && reportingChrome ? (
            <>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                {reportingChrome.labels.dayLine(dayNumAt(tooltip.index))}
              </p>
              <div className="space-y-1 text-sm">
                <p className="tabular-nums text-foreground">
                  <span className="text-muted">{reportingChrome.labels.tooltipActual}: </span>
                  <span className="font-semibold">{valueFormat(tooltip.actual)}</span>
                </p>
                {tooltip.target != null && (
                  <p className="tabular-nums text-foreground">
                    <span className="text-muted">{reportingChrome.labels.tooltipTarget}: </span>
                    <span className="font-semibold">{valueFormat(tooltip.target)}</span>
                  </p>
                )}
                {tooltip.target != null && (
                  <p className="tabular-nums text-foreground">
                    <span className="text-muted">{reportingChrome.labels.tooltipVariance}: </span>
                    <span className="font-semibold">{formatSignedSar(tooltip.actual - tooltip.target)}</span>
                  </p>
                )}
                {tooltip.target != null && (
                  <p className="tabular-nums text-foreground">
                    <span className="text-muted">{reportingChrome.labels.tooltipStatus}: </span>
                    <span className="font-semibold">
                      {tooltip.actual >= tooltip.target
                        ? reportingChrome.labels.statusAhead
                        : reportingChrome.labels.statusBehind}
                    </span>
                  </p>
                )}
                {crossover && tooltip.index === crossover.endIndex ? (
                  <p className="border-t border-border pt-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                    {reportingChrome.labels.targetReachedOnDay(crossover.dayNum)}
                  </p>
                ) : null}
              </div>
            </>
          ) : cfg.tooltipLabelPrefix ? (
            <>
              <p
                className={`font-semibold uppercase tracking-wider text-muted ${
                  cfg.tooltipCompact ? 'mb-1 text-[10px]' : 'mb-2 text-xs'
                }`}
              >
                {cfg.tooltipLabelPrefix}
                {tooltip.label}
              </p>
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
            </>
          ) : (
            <>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
                {tooltip.label}
              </p>
              <p className="text-xs font-semibold tabular-nums text-foreground">
                Actual: {valueFormat(tooltip.actual)}
              </p>
              {tooltip.target != null && (
                <p className="text-xs text-muted">Target: {valueFormat(tooltip.target)}</p>
              )}
            </>
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
            {reporting && reportingChrome ? reportingChrome.labels.legendActual : 'Actual'}
          </span>
          <span className="flex items-center gap-2">
            <span
              className={`inline-block rounded border border-dashed ${theme === 'home' ? 'h-1.5 w-5' : 'h-1 w-4'}`}
              style={{ borderColor: reporting ? targetColorReporting : cfg.targetColor }}
            />
            {reporting && reportingChrome ? reportingChrome.labels.legendTarget : 'Target'}
          </span>
        </div>
      )}
    </div>
  );
}
