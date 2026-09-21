'use client';

import type { ReactNode } from 'react';

export type ReportKpiStatus = 'positive' | 'negative' | 'neutral' | 'warning';

export type ReportKpiCardProps = {
  label: string;
  value: string | number;
  subtitle?: string;
  status?: ReportKpiStatus;
  icon?: ReactNode;
};

const STATUS_STYLES: Record<ReportKpiStatus, { value: string; accent: string }> = {
  positive: { value: 'text-emerald-700', accent: 'border-l-emerald-700' },
  negative: { value: 'text-red-600', accent: 'border-l-red-600' },
  warning: { value: 'text-amber-600', accent: 'border-l-amber-500' },
  neutral: { value: 'text-slate-900', accent: 'border-l-[#0F4C3A]' },
};

export function KpiCard({
  label,
  value,
  subtitle,
  status = 'neutral',
  icon,
}: ReportKpiCardProps) {
  const styles = STATUS_STYLES[status];

  return (
    <div
      className={`report-kpi-card rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md ${styles.accent} border-l-4`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
          {label}
        </p>
        {icon != null && <div className="text-slate-400">{icon}</div>}
      </div>
      <p className={`mt-2 text-2xl font-semibold tabular-nums tracking-tight md:text-3xl ${styles.value}`}>
        {value}
      </p>
      {subtitle != null && subtitle !== '' && (
        <p className="mt-1.5 text-sm text-slate-500">{subtitle}</p>
      )}
    </div>
  );
}
