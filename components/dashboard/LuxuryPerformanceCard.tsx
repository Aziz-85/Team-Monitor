'use client';

import { formatSarInt } from '@/lib/utils/money';
import { MiniSparkline } from './MiniSparkline';

type Props = {
  title: string;
  target: number;
  sales: number;
  remaining: number;
  percent: number;
  sparklineValues?: number[];
};

function getPerformanceColor(percent: number): { ring: string; text: string } {
  if (percent >= 100) return { ring: 'text-emerald-500', text: 'text-emerald-600' };
  if (percent >= 60) return { ring: 'text-amber-500', text: 'text-amber-600' };
  return { ring: 'text-red-500', text: 'text-red-600' };
}

export function LuxuryPerformanceCard({
  title,
  target,
  sales,
  remaining,
  percent,
  sparklineValues,
}: Props) {
  const colors = getPerformanceColor(percent);
  const size = 72;
  const stroke = 6;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (Math.min(100, Math.max(0, percent)) / 100) * circumference;

  return (
    <div className="group rounded-2xl border border-border bg-surface p-6 shadow-sm transition-all duration-200 hover:shadow-md hover:border-border/80">
      <div className="mb-4 flex items-start justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted">{title}</h3>
        {sparklineValues && sparklineValues.length >= 2 && (
          <MiniSparkline values={sparklineValues} height={28} className="text-muted" />
        )}
      </div>

      <div className="flex items-start gap-5">
        <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="-rotate-90">
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke="currentColor"
              strokeWidth={stroke}
              className="text-neutral-100"
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
              className={`${colors.ring} transition-all duration-500`}
            />
          </svg>
          <span
            className={`absolute inset-0 flex items-center justify-center text-sm font-bold tabular-nums ${colors.text}`}
          >
            {percent}%
          </span>
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="text-2xl font-bold tabular-nums text-foreground md:text-3xl">
              {formatSarInt(sales)}
            </p>
            <p className="mt-0.5 text-xs text-muted">Target {formatSarInt(target)}</p>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                percent >= 100 ? 'bg-emerald-500' : percent >= 60 ? 'bg-amber-500' : 'bg-red-500'
              }`}
              style={{ width: `${Math.min(100, percent)}%` }}
            />
          </div>
          <p className="text-xs text-muted">
            Remaining <span className="font-semibold tabular-nums text-foreground">{formatSarInt(remaining)}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
