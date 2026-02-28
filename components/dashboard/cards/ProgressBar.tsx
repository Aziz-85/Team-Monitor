'use client';

export function ProgressBar({
  valuePct,
  variant = 'default',
}: {
  valuePct: number;
  variant?: 'default' | 'orange' | 'red';
}) {
  const pct = Math.min(100, Math.max(0, valuePct));
  const bg =
    variant === 'red'
      ? 'bg-red-500'
      : variant === 'orange'
        ? 'bg-amber-500'
        : 'bg-sky-600';
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
      <div
        className={`h-full rounded-full transition-all ${bg}`}
        style={{ width: `${pct}%` }}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      />
    </div>
  );
}
