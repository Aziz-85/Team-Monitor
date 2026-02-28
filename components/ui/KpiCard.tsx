'use client';

export type KpiCardStatus = 'neutral' | 'success' | 'warning' | 'danger';

export type KpiCardProps = {
  label: string;
  value: string | number;
  note?: string;
  delta?: string;
  status?: KpiCardStatus;
};

const statusColors: Record<KpiCardStatus, string> = {
  neutral: 'text-slate-600',
  success: 'text-blue-600',
  warning: 'text-slate-600',
  danger: 'text-slate-700',
};

export function KpiCard({ label, value, note, delta, status = 'neutral' }: KpiCardProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-semibold text-slate-900">{value}</p>
      {note != null && note !== '' && (
        <p className="mt-1 text-sm text-slate-500">{note}</p>
      )}
      {delta != null && delta !== '' && (
        <p className={`mt-1 text-sm ${statusColors[status]}`}>{delta}</p>
      )}
    </div>
  );
}
