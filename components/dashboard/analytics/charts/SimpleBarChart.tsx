'use client';

type Point = { label: string; value: number };

type Props = { data: Point[]; height?: number; valueFormat?: (n: number) => string };

export function SimpleBarChart({ data, height = 140, valueFormat = (n) => String(n) }: Props) {
  if (data.length === 0) return <div style={{ height }} className="flex items-center justify-center rounded bg-surface-subtle text-sm text-muted" />;
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="space-y-1 rounded border border-border bg-surface-subtle/50 p-2" style={{ minHeight: height }}>
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-2 text-sm">
          <span className="w-24 truncate text-muted" title={d.label}>{d.label}</span>
          <div className="flex-1 rounded bg-surface-subtle" style={{ height: 20 }}>
            <div className="h-full rounded bg-accent" style={{ width: `${(d.value / max) * 100}%` }} />
          </div>
          <span className="w-16 text-end text-foreground">{valueFormat(d.value)}</span>
        </div>
      ))}
    </div>
  );
}
