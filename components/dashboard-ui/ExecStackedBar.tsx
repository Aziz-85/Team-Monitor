'use client';

export type ExecStackedBarProps = {
  /** Completed (or first segment) count */
  completed: number;
  /** Pending (or second segment) count */
  pending: number;
  /** Total width in px */
  width?: number;
  height?: number;
};

const DEFAULT_WIDTH = 48;
const DEFAULT_HEIGHT = 6;

export function ExecStackedBar({
  completed,
  pending,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
}: ExecStackedBarProps) {
  const total = completed + pending || 1;
  const completedPct = (completed / total) * 100;
  const pendingPct = 100 - completedPct;

  return (
    <div
      className="overflow-hidden rounded-full bg-slate-200"
      style={{ width, height }}
      aria-hidden
    >
      <div className="flex h-full w-full">
        <div
          className="h-full rounded-l-full bg-blue-700"
          style={{ width: `${completedPct}%`, minWidth: completed > 0 ? 2 : 0 }}
        />
        <div
          className="h-full rounded-r-full bg-slate-300"
          style={{ width: `${pendingPct}%`, minWidth: pending > 0 ? 2 : 0 }}
        />
      </div>
    </div>
  );
}
