'use client';

export type ExecDeltaProps = {
  deltaValue: number;
  deltaPct?: number;
  /** When true, negative delta is "good" (e.g. cost down); positive = amber when bad */
  invert?: boolean;
  /** Format delta value for display (e.g. +12,300) */
  formatValue?: (n: number) => string;
};

function defaultFormat(n: number): string {
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toLocaleString()}`;
}

export function ExecDelta({
  deltaValue,
  deltaPct,
  invert = false,
  formatValue = defaultFormat,
}: ExecDeltaProps) {
  const isNegative = deltaValue < 0;
  const isWeak =
    invert ? isNegative === false : isNegative;
  const colorClass = isWeak ? 'text-amber-700' : 'text-slate-600';
  const arrow = deltaValue > 0 ? '↑' : deltaValue < 0 ? '↓' : '';

  return (
    <div className={`flex flex-wrap items-center gap-x-1.5 text-xs tabular-nums ${colorClass}`}>
      <span aria-hidden>{arrow}</span>
      <span>Δ {formatValue(deltaValue)}</span>
      {deltaPct != null && (
        <span className="text-slate-500">
          ({deltaValue >= 0 ? '+' : ''}{deltaPct.toFixed(1)}%)
        </span>
      )}
    </div>
  );
}
