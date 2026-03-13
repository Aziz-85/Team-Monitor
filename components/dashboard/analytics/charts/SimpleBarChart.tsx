'use client';

import { ChartEmptyState } from '@/components/charts/ChartEmptyState';

type Point = { label: string; value: number };

type Props = {
  data: Point[];
  height?: number;
  valueFormat?: (n: number) => string;
  emptyLabel?: string;
};

export function SimpleBarChart({
  data,
  height = 140,
  valueFormat = (n) => n.toLocaleString(),
  emptyLabel = 'No data yet',
}: Props) {
  if (data.length === 0) {
    return (
      <ChartEmptyState
        minHeight={height}
        emptyLabel={emptyLabel}
        size="compact"
        variant="bordered"
        className="p-6"
      />
    );
  }

  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div
      className="space-y-2 rounded-xl border border-border bg-surface-subtle/50 p-4"
      style={{ minHeight: height }}
    >
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-3 text-sm">
          <span className="w-24 truncate text-muted" title={d.label}>
            {d.label}
          </span>
          <div className="flex-1 overflow-hidden rounded-full bg-neutral-100" style={{ height: 20 }}>
            <div
              className="h-full rounded-full bg-teal-600 transition-all"
              style={{ width: `${(d.value / max) * 100}%` }}
            />
          </div>
          <span className="w-20 text-end font-medium tabular-nums text-foreground">
            {valueFormat(d.value)}
          </span>
        </div>
      ))}
    </div>
  );
}
