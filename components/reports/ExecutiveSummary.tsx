'use client';

import { formatSarInt } from '@/lib/utils/money';

export type ExecutiveSummaryProps = {
  title: string;
  revenueYtd: number;
  vsLastYearPct: number | null;
  pctOfTarget: number | null;
  subtitle?: string;
};

function formatPct(value: number | null, suffix = ''): string {
  if (value == null) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value}%${suffix}`;
}

function pctStatus(value: number | null): 'positive' | 'negative' | 'neutral' {
  if (value == null) return 'neutral';
  if (value >= 100) return 'positive';
  if (value < 90) return 'negative';
  return 'neutral';
}

export function ExecutiveSummary({
  title,
  revenueYtd,
  vsLastYearPct,
  pctOfTarget,
  subtitle,
}: ExecutiveSummaryProps) {
  const targetStatus = pctStatus(pctOfTarget);
  const lyStatus =
    vsLastYearPct == null ? 'neutral' : vsLastYearPct >= 0 ? 'positive' : 'negative';

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0F4C3A]">{title}</p>
      {subtitle != null && subtitle !== '' && (
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      )}
      <p className="mt-4 text-3xl font-semibold tabular-nums tracking-tight text-slate-900">
        {formatSarInt(revenueYtd)}
      </p>
      <div className="mt-4 grid grid-cols-2 gap-4 border-t border-slate-100 pt-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            vs Last Year
          </p>
          <p
            className={`mt-1 text-lg font-semibold tabular-nums ${
              lyStatus === 'positive'
                ? 'text-emerald-700'
                : lyStatus === 'negative'
                  ? 'text-red-600'
                  : 'text-slate-700'
            }`}
          >
            {formatPct(vsLastYearPct)}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            % of Target
          </p>
          <p
            className={`mt-1 text-lg font-semibold tabular-nums ${
              targetStatus === 'positive'
                ? 'text-emerald-700'
                : targetStatus === 'negative'
                  ? 'text-red-600'
                  : 'text-slate-700'
            }`}
          >
            {pctOfTarget != null ? `${pctOfTarget}%` : '—'}
          </p>
        </div>
      </div>
    </div>
  );
}
