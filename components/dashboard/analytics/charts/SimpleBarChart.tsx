'use client';

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
      <div
        style={{ minHeight: height }}
        className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-surface-subtle/50 p-6 text-center"
      >
        <svg
          className="h-8 w-8 text-muted/60"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75z"
          />
        </svg>
        <p className="text-xs font-medium text-muted">{emptyLabel}</p>
      </div>
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
