'use client';

import { formatSarInt } from '@/lib/utils/money';

type Props = {
  title: string;
  name: string | null;
  amount: number;
};

export function LuxuryTopSellerCard({ title, name, amount }: Props) {
  const hasData = name && amount > 0;
  return (
    <div className="group rounded-2xl border border-border bg-surface p-5 shadow-sm transition-all duration-200 hover:shadow-md hover:border-border/80">
      <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.15em] text-muted">{title}</h3>
      <p className="truncate text-xl font-bold text-foreground">{hasData ? name : '—'}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-muted">{hasData ? formatSarInt(amount) : '—'}</p>
    </div>
  );
}
