'use client';

const GOLD = '#C6A756';

type Point = { label: string; value: number };
type Props = {
  data: Point[];
  height?: number;
  valueFormat?: (n: number) => string;
};

export function ExecutiveBarChart({
  data,
  height = 180,
  valueFormat = (n) => n.toLocaleString(),
}: Props) {
  if (!data.length) return <div style={{ height }} className="flex items-center justify-center text-gray-500 text-sm">No data</div>;
  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const padding = { top: 8, right: 8, bottom: 28, left: 36 };
  const w = 320;
  const barH = Math.max(12, (height - padding.top - padding.bottom - (data.length - 1) * 4) / data.length);
  const gap = 4;

  return (
    <div className="w-full overflow-hidden">
      <svg width="100%" height={height} viewBox={`0 0 ${w} ${height}`} className="min-w-0" preserveAspectRatio="xMidYMid meet">
        {data.map((d, i) => {
          const y = padding.top + i * (barH + gap);
          const barW = (w - padding.left - padding.right) * (d.value / maxVal);
          return (
            <g key={i}>
              <rect
                x={padding.left}
                y={y}
                width={barW}
                height={barH}
                fill={GOLD}
                rx={2}
                className="opacity-90"
              />
              <text x={padding.left - 4} y={y + barH / 2 + 3} textAnchor="end" className="fill-gray-600 text-[10px]">
                {d.label}
              </text>
              <text x={padding.left + barW + 4} y={y + barH / 2 + 3} textAnchor="start" className="fill-gray-700 text-[10px]">
                {valueFormat(d.value)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
