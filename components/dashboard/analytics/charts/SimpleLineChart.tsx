'use client';

type Point = { label: string; value: number };

type Props = { data: Point[]; height?: number };

export function SimpleLineChart({ data, height = 200 }: Props) {
  if (data.length === 0) return <div style={{ height }} className="flex items-center justify-center rounded bg-slate-50 text-sm text-slate-500" />;
  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 400;
  const h = height - 24;
  const pts = data.map((d, i) => {
    const x = (i / (data.length - 1 || 1)) * (w - 40) + 20;
    const y = h - 10 - ((d.value - min) / range) * (h - 20);
    return `${x},${y}`;
  });
  const path = `M ${pts.join(' L ')}`;
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${height}`} className="overflow-visible rounded border border-slate-100 bg-slate-50/50" preserveAspectRatio="none">
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-slate-600" />
    </svg>
  );
}
