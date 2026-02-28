'use client';

import { SCHEDULE_UI, MAX_COVERAGE_LINES } from '@/lib/scheduleUi';

export type DayGuests = { am: Array<{ id?: string; name: string }>; pm: Array<{ id?: string; name: string }> };

type CoverageCellProps = {
  /** Per-day guest coverage (AM/PM). If undefined or empty, shows "—". */
  dayGuests?: DayGuests | null;
  /** Optional pre-built lines (overrides dayGuests if provided). */
  lines?: string[];
  className?: string;
  title?: string;
};

/**
 * Renders external coverage stacked lines (Name AM / Name PM) using shared schedule UI tokens.
 * Used in View and Editor for identical styling. Max MAX_COVERAGE_LINES then "+N".
 */
export function CoverageCell({ dayGuests, lines: linesProp, className = '', title }: CoverageCellProps) {
  const lines: string[] =
    linesProp ??
    (() => {
      if (!dayGuests) return [];
      const out: string[] = [];
      (dayGuests.am ?? []).forEach((g) => out.push(`${g.name} AM`));
      (dayGuests.pm ?? []).forEach((g) => out.push(`${g.name} PM`));
      return out;
    })();

  if (lines.length === 0) {
    return (
      <span className={`${SCHEDULE_UI.guestLine} text-slate-500 ${className}`.trim()} title={title}>
        —
      </span>
    );
  }

  const show = lines.slice(0, MAX_COVERAGE_LINES);
  const extra = lines.length - MAX_COVERAGE_LINES;

  return (
    <div
      className={`${SCHEDULE_UI.guestStack} ${className}`.trim()}
      title={title ?? (lines.length > MAX_COVERAGE_LINES ? lines.join(', ') : undefined)}
    >
      {show.map((line, idx) => (
        <span key={idx} className={`${SCHEDULE_UI.guestLine} font-medium text-slate-800`}>
          {line}
        </span>
      ))}
      {extra > 0 && <span className={`${SCHEDULE_UI.guestLine} text-slate-500`}>+{extra}</span>}
    </div>
  );
}
