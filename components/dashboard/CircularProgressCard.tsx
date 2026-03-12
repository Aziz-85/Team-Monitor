'use client';

import { formatSarInt } from '@/lib/utils/money';

type Props = {
  title: string;
  target: number;
  sales: number;
  remaining: number;
  percent: number;
};

export function CircularProgressCard({ title, target, sales, remaining, percent }: Props) {
  const size = 100;
  const stroke = 8;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (Math.min(100, Math.max(0, percent)) / 100) * circumference;

  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-sm md:p-5">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">{title}</h3>
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="-rotate-90">
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke="currentColor"
              strokeWidth={stroke}
              className="text-surface-subtle"
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke="currentColor"
              strokeWidth={stroke}
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              strokeLinecap="round"
              className="text-accent transition-[stroke-dashoffset] duration-500"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-lg font-bold text-foreground">
            {percent}%
          </span>
        </div>
        <div className="min-w-0 flex-1 space-y-1 text-sm">
          <p>
            <span className="text-muted">Sales:</span>{' '}
            <span className="font-semibold text-foreground">{formatSarInt(sales)}</span>
          </p>
          <p>
            <span className="text-muted">Target:</span>{' '}
            <span className="font-medium text-foreground">{formatSarInt(target)}</span>
          </p>
          <p>
            <span className="text-muted">Remaining:</span>{' '}
            <span className="font-medium text-foreground">{formatSarInt(remaining)}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
