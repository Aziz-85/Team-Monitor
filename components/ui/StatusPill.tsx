type Variant = 'primary' | 'backup1' | 'backup2' | 'unassigned' | 'pending' | 'late' | 'completed' | 'neutral';

const styles: Record<Variant, string> = {
  primary: 'bg-blue-50 text-blue-900 border-blue-200',
  backup1: 'bg-amber-50 text-amber-900 border-amber-200',
  backup2: 'bg-slate-50 text-slate-700 border-slate-200',
  unassigned: 'bg-red-50 text-red-900 border-red-200',
  pending: 'bg-amber-50 text-amber-900 border-amber-200',
  late: 'bg-red-50 text-red-900 border-red-200',
  completed: 'bg-emerald-50 text-emerald-900 border-emerald-200',
  neutral: 'bg-slate-50 text-slate-700 border-slate-200',
};

export function StatusPill({ variant, children }: { variant: Variant; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${styles[variant]}`}
    >
      {children}
    </span>
  );
}
