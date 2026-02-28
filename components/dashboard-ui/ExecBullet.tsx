'use client';

export type ExecBulletProps = {
  value: number;
  target: number;
  max: number;
  thresholds?: { good: number; watch: number };
  height?: number;
};

const DEFAULT_HEIGHT = 24;

export function ExecBullet({
  value,
  target,
  max,
  thresholds,
  height = DEFAULT_HEIGHT,
}: ExecBulletProps) {
  const safeMax = Math.max(max, 1);
  const valuePct = Math.min(100, Math.max(0, (value / safeMax) * 100));
  const targetPct = Math.min(100, Math.max(0, (target / safeMax) * 100));

  const goodPct = thresholds?.good != null ? Math.min(100, (thresholds.good / safeMax) * 100) : 0;
  const watchPct = thresholds?.watch != null ? Math.min(100, (thresholds.watch / safeMax) * 100) : 0;

  return (
    <div className="relative min-w-0 overflow-hidden rounded" style={{ height }} aria-hidden>
      <div className="absolute inset-0 flex w-full">
        {thresholds != null && watchPct > 0 && (
          <div
            className="h-full bg-slate-100"
            style={{ width: `${watchPct}%`, minWidth: watchPct > 0 ? 2 : 0 }}
          />
        )}
        {thresholds != null && goodPct > watchPct && (
          <div
            className="h-full bg-slate-50"
            style={{
              width: `${goodPct - watchPct}%`,
              minWidth: goodPct > watchPct ? 2 : 0,
            }}
          />
        )}
        <div
          className="h-full flex-1 bg-slate-200"
          style={{ minWidth: 4 }}
        />
      </div>
      <div
        className="absolute inset-y-0 start-0 h-full rounded bg-blue-700"
        style={{ width: `${valuePct}%`, minWidth: value > 0 ? 2 : 0 }}
      />
      {target > 0 && target <= max && (
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-slate-900"
          style={{ left: `${targetPct}%`, marginLeft: -1 }}
          title={`Target: ${target}`}
        />
      )}
    </div>
  );
}
