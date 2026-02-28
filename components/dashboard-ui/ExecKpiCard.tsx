'use client';

import type { ReactNode } from 'react';
import { ExecDelta } from './ExecDelta';
import { ExecSparkline } from './ExecSparkline';

export type ExecKpiCardTone = 'neutral' | 'success' | 'warning' | 'danger';

export type ExecKpiCardProps = {
  label: string;
  value: string | number;
  meta?: string;
  footer?: string;
  tone?: ExecKpiCardTone;
  /** 0–100 for progress bar; omit to hide */
  progress?: number;
  /** Optional right slot (e.g. ExecGauge) */
  rightVisual?: ReactNode;
  /** Optional sparkline data (last N points) */
  sparkline?: number[];
  /** Delta absolute value (e.g. actual - target) */
  deltaValue?: number;
  /** Delta percent for subtitle */
  deltaPct?: number;
  /** Invert delta coloring (negative = good) */
  deltaInvert?: boolean;
  /** Custom formatter for delta value */
  formatDeltaValue?: (n: number) => string;
};

const valueToneClasses: Record<ExecKpiCardTone, string> = {
  neutral: 'text-slate-900',
  success: 'text-slate-900',
  warning: 'text-slate-900',
  danger: 'text-slate-900',
};

export function ExecKpiCard({
  label,
  value,
  meta,
  footer,
  tone = 'neutral',
  progress,
  rightVisual,
  sparkline,
  deltaValue,
  deltaPct,
  deltaInvert,
  formatDeltaValue,
}: ExecKpiCardProps) {
  const hasFooter = footer != null && footer !== '';
  const hasDelta = deltaValue != null;
  const hasSparkline = sparkline != null && sparkline.length >= 2;

  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-[10px] font-medium uppercase tracking-wider text-slate-500">
          {label}
        </p>
        {rightVisual != null && <div className="shrink-0">{rightVisual}</div>}
      </div>
      <p className={`mt-1 text-3xl font-semibold tabular-nums ${valueToneClasses[tone]}`}>
        {value}
      </p>
      {meta != null && meta !== '' && (
        <p className="mt-0.5 text-sm text-slate-600">{meta}</p>
      )}
      {hasDelta && (
        <div className="mt-1.5">
          <ExecDelta
            deltaValue={deltaValue}
            deltaPct={deltaPct}
            invert={deltaInvert}
            formatValue={formatDeltaValue}
          />
        </div>
      )}
      {hasSparkline && (
        <div className="mt-1.5 h-5 w-full min-w-0">
          <ExecSparkline values={sparkline} width={80} height={20} />
        </div>
      )}
      {hasFooter && <div className="my-2 border-b border-slate-200" />}
      {hasFooter && (
        <p className="text-xs text-slate-500">{footer}</p>
      )}
      {progress != null && !rightVisual && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-blue-700 transition-all"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      )}
    </div>
  );
}
