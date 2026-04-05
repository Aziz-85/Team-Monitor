'use client';

import { formatSarInt } from '@/lib/utils/money';

export function AnalyticsMiniBars({
  items,
  emptyLabel,
}: {
  items: { label: string; value: number; max: number }[];
  emptyLabel: string;
}) {
  if (!items.length) {
    return <p className="text-sm text-muted">{emptyLabel}</p>;
  }
  const maxVal = Math.max(1, ...items.map((i) => Math.max(i.max, i.value, 0)));
  return (
    <ul className="space-y-3">
      {items.map((row) => (
        <li key={row.label} className="min-w-0">
          <div className="mb-1 flex justify-between gap-2 text-xs">
            <span className="min-w-0 truncate font-medium text-foreground">{row.label}</span>
            <span className="shrink-0 tabular-nums text-muted">{formatSarInt(row.value)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-subtle">
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${Math.min(100, Math.round((row.value / maxVal) * 100))}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
