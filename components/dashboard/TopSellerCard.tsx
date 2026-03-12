'use client';

import { formatSarInt } from '@/lib/utils/money';

type Props = {
  title: string;
  name: string | null;
  amount: number;
};

export function TopSellerCard({ title, name, amount }: Props) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
      <p className="truncate text-lg font-semibold text-foreground">{name || '—'}</p>
      <p className="text-sm text-muted">{formatSarInt(amount)}</p>
    </div>
  );
}
