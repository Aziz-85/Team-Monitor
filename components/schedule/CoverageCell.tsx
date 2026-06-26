'use client';

import { SCHEDULE_UI, MAX_COVERAGE_LINES } from '@/lib/scheduleUi';
import { formatCoverageName } from '@/lib/schedule/displayName';
import { ScheduleSlotLabelSpan } from '@/components/schedule/ScheduleSlotLabel';

export type DayGuest = { id?: string; name: string; empId?: string };
export type DayGuests = { am: DayGuest[]; pm: DayGuest[] };

type CoverageCellProps = {
  /** Per-day guest coverage (AM/PM). Renders nothing when empty. */
  dayGuests?: DayGuests | null;
  /** Optional pre-built lines (overrides dayGuests if provided). */
  lines?: string[];
  /** Short-name map keyed by empId or normalized full name. */
  displayNameMap?: Map<string, string>;
  className?: string;
  title?: string;
};

/**
 * Renders external coverage stacked lines (Name AM / Name PM) using shared schedule UI tokens.
 * Used in View and Editor for identical styling. Max MAX_COVERAGE_LINES then "+N".
 */
export function CoverageCell({
  dayGuests,
  lines: linesProp,
  displayNameMap,
  className = '',
  title,
}: CoverageCellProps) {
  const formattedLines =
    linesProp == null && dayGuests
      ? [
          ...(dayGuests.am ?? []).map((g) =>
            formatCoverageName(g.name, 'AM', displayNameMap, g.empId ?? g.id)
          ),
          ...(dayGuests.pm ?? []).map((g) =>
            formatCoverageName(g.name, 'PM', displayNameMap, g.empId ?? g.id)
          ),
        ]
      : null;

  const lines: string[] =
    linesProp ??
    (() => {
      if (!formattedLines) return [];
      return formattedLines.map((line) => line.text + (line.isSplit ? ' ↕' : ''));
    })();

  if (lines.length === 0 && !formattedLines?.length) {
    return null;
  }

  const showCount = formattedLines?.length ?? lines.length;
  const show = formattedLines ?? null;
  const extra = showCount - MAX_COVERAGE_LINES;

  return (
    <div
      className={`${SCHEDULE_UI.guestStack} ${className}`.trim()}
      title={title ?? (showCount > MAX_COVERAGE_LINES ? lines.join(', ') : undefined)}
    >
      {show
        ? show.slice(0, MAX_COVERAGE_LINES).map((line, idx) => (
            <span key={idx} className={`${SCHEDULE_UI.guestLine} font-medium text-foreground`}>
              <ScheduleSlotLabelSpan label={line} />
            </span>
          ))
        : lines.slice(0, MAX_COVERAGE_LINES).map((line, idx) => (
            <span key={idx} className={`${SCHEDULE_UI.guestLine} font-medium text-foreground`}>
              {line}
            </span>
          ))}
      {extra > 0 && <span className={`${SCHEDULE_UI.guestLine} text-muted`}>+{extra}</span>}
    </div>
  );
}
