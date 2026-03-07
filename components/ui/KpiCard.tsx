'use client';

import type { ReactNode } from 'react';

export type KpiCardStatus = 'neutral' | 'success' | 'warning' | 'danger';

export type KpiCardProps = {
  label: string;
  value: string | number;
  note?: string;
  delta?: string;
  status?: KpiCardStatus;
  /** Short trend text (e.g. "+12% vs last period") */
  trend?: string;
  /** Custom trend content; ignored if trend is set */
  trendSlot?: ReactNode;
};

const statusColors: Record<KpiCardStatus, string> = {
  neutral: 'text-muted',
  success: 'text-luxury-success',
  warning: 'text-amber-600',
  danger: 'text-luxury-error',
};

export function KpiCard({ label, value, note, delta, status = 'neutral', trend, trendSlot }: KpiCardProps) {
  return (
    <div className="min-h-[7rem] rounded-lg border border-border bg-surface p-5 shadow-card">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground md:text-3xl">{value}</p>
      {note != null && note !== '' && (
        <p className="mt-1 text-sm text-muted">{note}</p>
      )}
      {delta != null && delta !== '' && (
        <p className={`mt-1 text-sm ${statusColors[status]}`}>{delta}</p>
      )}
      {trend != null && trend !== '' && (
        <p className="mt-1 text-xs text-muted">{trend}</p>
      )}
      {trend == null && trendSlot != null && (
        <div className="mt-1 text-xs text-muted">{trendSlot}</div>
      )}
    </div>
  );
}
