'use client';

export type ExecBadgeStatus = 'ok' | 'watch' | 'action' | 'neutral';

export type ExecBadgeProps = {
  status: ExecBadgeStatus;
  children?: React.ReactNode;
  /** Override label; default: OK / Watch / Action / — */
  label?: string;
};

const statusClasses: Record<ExecBadgeStatus, string> = {
  ok: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  watch: 'bg-amber-50 text-amber-800 border-amber-200',
  action: 'bg-amber-50 text-amber-800 border-amber-200',
  neutral: 'bg-slate-50 text-slate-600 border-slate-200',
};

const defaultLabels: Record<ExecBadgeStatus, string> = {
  ok: 'OK',
  watch: 'Watch',
  action: 'Action',
  neutral: '—',
};

export function ExecBadge({ status, children, label }: ExecBadgeProps) {
  const text = children ?? label ?? defaultLabels[status];
  if (status === 'neutral' && (text === '—' || text === '')) return null;
  return (
    <span
      className={`inline-flex shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-medium ${statusClasses[status]}`}
    >
      {text}
    </span>
  );
}
