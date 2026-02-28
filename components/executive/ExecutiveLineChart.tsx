'use client';

const GOLD = '#C6A756';

type Point = { label: string; value: number };
type Props = {
  data: Point[];
  targetLine?: number[];
  height?: number;
  valueFormat?: (n: number) => string;
};

export function ExecutiveLineChart({
  data,
  targetLine,
  height = 200,
  valueFormat = (n) => n.toLocaleString(),
}: Props) {
  if (!data.length) return <div style={{ height }} className="flex items-center justify-center text-gray-500 text-sm">No data</div>;
  const values = data.map((d) => d.value);
  const targetValues = targetLine ?? [];
  const maxVal = Math.max(
    ...values,
    ...targetValues,
    1
  );
  const padding = { top: 12, right: 8, bottom: 24, left: 40 };
  const w = 320;
  const h = height - padding.top - padding.bottom;
  const xScale = (i: number) => padding.left + (i / Math.max(1, data.length - 1)) * (w - padding.left - padding.right);
  const yScale = (v: number) => padding.top + h - (v / maxVal) * h;

  const salesPath =
    data.length > 0
      ? data
          .map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScale(d.value)}`)
          .join(' ')
      : '';
  const targetPath =
    targetLine && targetLine.length === data.length
      ? targetLine
          .map((v, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScale(v)}`)
          .join(' ')
      : '';

  return (
    <div className="w-full overflow-hidden">
      <svg width="100%" height={height} viewBox={`0 0 ${w} ${height}`} className="min-w-0" preserveAspectRatio="xMidYMid meet">
        {Array.from({ length: 5 }).map((_, i) => {
          const y = padding.top + (h * (4 - i)) / 4;
          const v = Math.round((maxVal * (4 - i)) / 4);
          return (
            <g key={i}>
              <line x1={padding.left} y1={y} x2={w - padding.right} y2={y} stroke="#f0f0f0" strokeWidth="1" />
              <text x={padding.left - 6} y={y + 4} textAnchor="end" className="fill-gray-500 text-[10px]">
                {valueFormat(v)}
              </text>
            </g>
          );
        })}
        {data.map((d, i) => (
          <text
            key={i}
            x={xScale(i)}
            y={height - 6}
            textAnchor="middle"
            className="fill-gray-500 text-[10px]"
          >
            {d.label.length > 7 ? d.label.slice(-2) : d.label}
          </text>
        ))}
        {targetPath ? (
          <path d={targetPath} fill="none" stroke="#e0d5b8" strokeWidth="1.5" strokeDasharray="4 2" />
        ) : null}
        <path d={salesPath} fill="none" stroke={GOLD} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
