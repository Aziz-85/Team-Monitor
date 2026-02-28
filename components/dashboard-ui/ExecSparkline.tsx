'use client';

export type ExecSparklineProps = {
  values: number[];
  strokeClassName?: string;
  /** Width of SVG; height is derived from viewBox */
  width?: number;
  height?: number;
};

const DEFAULT_WIDTH = 64;
const DEFAULT_HEIGHT = 20;

export function ExecSparkline({
  values,
  strokeClassName = 'stroke-blue-700',
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
}: ExecSparklineProps) {
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const padding = 2;
  const w = width - padding * 2;
  const h = height - padding * 2;
  const stepX = w / (values.length - 1);

  const points = values.map((v, i) => {
    const x = padding + i * stepX;
    const y = padding + h - ((v - min) / range) * h;
    return `${x},${y}`;
  });
  const d = `M ${points.join(' L ')}`;

  return (
    <svg
      className="overflow-visible"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none meet"
      aria-hidden
    >
      <path
        d={d}
        fill="none"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={strokeClassName}
      />
    </svg>
  );
}
