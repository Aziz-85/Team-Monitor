'use client';

import { formatSarInt } from '@/lib/utils/money';

export type TopSellerEntry = {
  employeeId: string;
  employeeName: string;
  amount: number;
  rank: number;
};

type Props = {
  title: string;
  entries: TopSellerEntry[];
  emptyLabel: string;
  /** Shown under the title when rankings refer to a fallback day */
  subtitle?: string | null;
};

export function LuxuryTopSellerCard({ title, entries, emptyLabel, subtitle }: Props) {
  const hasData = entries.length > 0;
  return (
    <div className="group rounded-2xl border border-border bg-surface p-5 shadow-sm transition-all duration-200 hover:shadow-md hover:border-border/80">
      <h3 className={`text-[11px] font-semibold uppercase tracking-[0.15em] text-muted ${subtitle ? 'mb-1' : 'mb-3'}`}>
        {title}
      </h3>
      {subtitle ? <p className="mb-3 text-[10px] text-muted/90">{subtitle}</p> : null}
      {hasData ? (
        <ul className="space-y-2">
          {entries.map((e) => (
            <li key={e.employeeId} className="flex items-baseline justify-between gap-2">
              <span className={e.rank === 1 ? 'text-base font-bold text-foreground' : 'text-sm font-medium text-foreground/90'}>
                #{e.rank} {e.employeeName}
              </span>
              <span className={`tabular-nums ${e.rank === 1 ? 'text-base font-semibold text-muted' : 'text-sm text-muted/90'}`}>
                {formatSarInt(e.amount)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">{emptyLabel}</p>
      )}
    </div>
  );
}
