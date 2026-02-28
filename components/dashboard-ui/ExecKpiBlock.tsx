'use client';

export type ExecKpiBlockStatus = 'ok' | 'watch' | 'action' | 'neutral';

export type ExecKpiBlockProps = {
  title: string;
  actualLabel?: string;
  actual: string | number;
  targetLabel?: string;
  target?: string | number;
  variance?: string | number;
  variancePct?: string | number;
  compareLabel?: string;
  compareValue?: string;
  status?: ExecKpiBlockStatus;
  footnote?: string;
  /** Optional slot for bullet chart below the block */
  bullet?: React.ReactNode;
};

const statusBadgeClasses: Record<ExecKpiBlockStatus, string> = {
  ok: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  watch: 'bg-amber-50 text-amber-800 border-amber-200',
  action: 'bg-amber-50 text-amber-800 border-amber-200',
  neutral: 'bg-slate-50 text-slate-600 border-slate-200',
};

export function ExecKpiBlock({
  title,
  actualLabel = 'Actual',
  actual,
  targetLabel = 'Target',
  target,
  variance,
  variancePct,
  compareLabel,
  compareValue,
  status = 'neutral',
  footnote,
  bullet,
}: ExecKpiBlockProps) {
  const hasTarget = target != null && String(target).trim() !== '';
  const hasVariance = variance != null && String(variance).trim() !== '';
  const hasCompare = compareValue != null && compareValue.trim() !== '';
  const showStatusBadge = status !== 'neutral';

  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
          {title}
        </h3>
        {showStatusBadge && (
          <span
            className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-medium ${statusBadgeClasses[status as ExecKpiBlockStatus]}`}
          >
            {status === 'ok' && 'On track'}
            {status === 'watch' && 'Watch'}
            {status === 'action' && 'Action'}
          </span>
        )}
      </div>

      <div className="mt-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0">
          <div>
            <span className="text-[10px] uppercase tracking-wide text-slate-400">{actualLabel}</span>
            <p className="text-2xl font-semibold tabular-nums text-slate-900">{actual}</p>
          </div>
          {hasTarget && (
            <div className="border-s border-slate-200 ps-3">
              <span className="text-[10px] uppercase tracking-wide text-slate-400">{targetLabel}</span>
              <p className="text-sm tabular-nums text-slate-600">{target}</p>
            </div>
          )}
        </div>
      </div>

      {(hasVariance || variancePct != null) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 text-xs tabular-nums">
          <span className="text-slate-600">
            Δ {variance != null ? variance : '—'}
          </span>
          {variancePct != null && String(variancePct).trim() !== '' && (
            <span className="text-slate-500">({variancePct})</span>
          )}
        </div>
      )}

      {hasCompare && (
        <div className="mt-2">
          <span className="inline-flex items-center rounded bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
            {compareLabel != null && compareLabel !== '' && (
              <span className="font-medium me-1">{compareLabel}</span>
            )}
            {compareValue}
          </span>
        </div>
      )}

      {bullet != null && <div className="mt-3 min-w-0">{bullet}</div>}

      {footnote != null && footnote.trim() !== '' && (
        <p className="mt-3 border-t border-slate-100 pt-2 text-[10px] text-slate-500">
          {footnote}
        </p>
      )}
    </div>
  );
}
