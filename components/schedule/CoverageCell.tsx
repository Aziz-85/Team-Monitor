'use client';

import { SPLIT_SHIFT_GLYPH, formatScheduleEmployeeName } from '@/lib/schedule/displayName';
import type { CoverageItem, CoverageShift } from '@/lib/schedule/coverageItems';
import {
  DEFAULT_COVERAGE_TOOLTIP_LABELS,
  buildCoverageItemTooltip,
  type CoverageTooltipLabels,
} from '@/lib/schedule/coverageItems';
import { SCHEDULE_UI, MAX_COVERAGE_LINES } from '@/lib/scheduleUi';

export type { CoverageItem, CoverageShift, CoverageTooltipLabels };
export { buildCoverageItemTooltip };

function ShiftBadge({ shift }: { shift: CoverageShift }) {
  if (shift === 'AM') {
    return (
      <span className="inline-flex shrink-0 items-center rounded border border-blue-300 bg-blue-50 px-1 py-0 text-[10px] font-semibold leading-4 text-blue-900">
        AM
      </span>
    );
  }
  if (shift === 'PM') {
    return (
      <span className="inline-flex shrink-0 items-center rounded border border-amber-300 bg-amber-50 px-1 py-0 text-[10px] font-semibold leading-4 text-amber-900">
        PM
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 items-center rounded border border-violet-300 bg-violet-50 px-1 py-0 text-[10px] font-semibold leading-4 text-violet-900">
      {SPLIT_SHIFT_GLYPH}
    </span>
  );
}

function CoverageRow({
  item,
  displayName,
  tooltip,
}: {
  item: CoverageItem;
  displayName: string;
  tooltip: string;
}) {
  return (
    <div
      className={`${SCHEDULE_UI.guestLine} flex min-w-0 items-center gap-1 font-medium text-foreground`}
      title={tooltip}
    >
      <span className="truncate">{displayName}</span>
      <ShiftBadge shift={item.shift} />
    </div>
  );
}

type CoverageCellProps = {
  coverageItems?: CoverageItem[];
  displayNameMap?: Map<string, string>;
  tooltipLabels?: Partial<CoverageTooltipLabels>;
  className?: string;
};

/**
 * Renders external coverage as stacked rows (short name + shift badge).
 * Shared by Schedule View grid, Excel HTML table, and Mobile cards.
 */
export function CoverageCell({
  coverageItems = [],
  displayNameMap,
  tooltipLabels,
  className = '',
}: CoverageCellProps) {
  if (coverageItems.length === 0) return null;

  const labels = { ...DEFAULT_COVERAGE_TOOLTIP_LABELS, ...tooltipLabels };
  const visible = coverageItems.slice(0, MAX_COVERAGE_LINES);
  const extra = coverageItems.length - MAX_COVERAGE_LINES;

  return (
    <div className={`${SCHEDULE_UI.guestStack} ${className}`.trim()}>
      {visible.map((item, idx) => (
        <CoverageRow
          key={item.id ?? `${item.employeeId ?? item.fullName}-${item.shift}-${idx}`}
          item={item}
          displayName={formatScheduleEmployeeName(item.fullName, displayNameMap, item.employeeId)}
          tooltip={buildCoverageItemTooltip(item, labels)}
        />
      ))}
      {extra > 0 && <span className={`${SCHEDULE_UI.guestLine} text-muted`}>+{extra}</span>}
    </div>
  );
}
