'use client';

export function ProgressBar({
  valuePct,
  variant = 'default',
}: {
  valuePct: number;
  variant?: 'default' | 'orange' | 'red' | 'green' | 'gold';
}) {
  const barWidth = Math.min(100, Math.max(0, valuePct));
  const bg =
    variant === 'red'
      ? 'bg-red-500'
      : variant === 'orange'
        ? 'bg-amber-500'
        : variant === 'green'
          ? 'bg-emerald-500'
          : variant === 'gold'
            ? 'bg-amber-400'
            : 'bg-sky-600';
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-subtle">
      <div
        className={`h-full rounded-full transition-all ${bg}`}
        style={{ width: `${barWidth}%` }}
        role="progressbar"
        aria-valuenow={barWidth}
        aria-valuemin={0}
        aria-valuemax={100}
      />
    </div>
  );
}
