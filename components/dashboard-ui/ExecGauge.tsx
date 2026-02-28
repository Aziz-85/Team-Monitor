'use client';

export type ExecGaugeProps = {
  percent: number;
  label?: string;
  valueText?: string;
  size?: number;
};

const DEFAULT_SIZE = 44;

export function ExecGauge({
  percent,
  label,
  valueText,
  size = DEFAULT_SIZE,
}: ExecGaugeProps) {
  const p = Math.min(100, Math.max(0, percent));
  const r = (size - 4) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const strokeWidth = 4;
  const radius = r - strokeWidth / 2;
  const startAngleDeg = 180;
  const endAngleDeg = 0;
  const startRad = (startAngleDeg * Math.PI) / 180;
  const endRad = (endAngleDeg * Math.PI) / 180;
  const x1 = cx + radius * Math.cos(startRad);
  const y1 = cy + radius * Math.sin(startRad);
  const x2 = cx + radius * Math.cos(endRad);
  const y2 = cy + radius * Math.sin(endRad);
  const trackD = `M ${x1} ${y1} A ${radius} ${radius} 0 1 1 ${x2} ${y2}`;
  const fillEndDeg = 180 - (p / 100) * 180;
  const fillEndRad = (fillEndDeg * Math.PI) / 180;
  const fillX = cx + radius * Math.cos(fillEndRad);
  const fillY = cy + radius * Math.sin(fillEndRad);
  const fillD = p > 0 ? `M ${x1} ${y1} A ${radius} ${radius} 0 ${p >= 50 ? 1 : 0} 1 ${fillX} ${fillY}` : '';

  return (
    <div className="flex flex-col items-center justify-center">
      <div className="relative inline-flex" style={{ width: size, height: size / 2 + strokeWidth }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="overflow-visible"
          aria-hidden
        >
          <path
            d={trackD}
            fill="none"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            className="stroke-slate-200"
          />
          {fillD && (
            <path
              d={fillD}
              fill="none"
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              className="stroke-blue-700"
            />
          )}
        </svg>
        <span
          className="absolute bottom-0 left-1/2 -translate-x-1/2 text-[10px] font-semibold tabular-nums text-slate-900"
          style={{ bottom: 2 }}
        >
          {valueText ?? `${Math.round(p)}%`}
        </span>
      </div>
      {label != null && label !== '' && (
        <span className="mt-0.5 text-[9px] uppercase tracking-wide text-slate-500">{label}</span>
      )}
    </div>
  );
}
