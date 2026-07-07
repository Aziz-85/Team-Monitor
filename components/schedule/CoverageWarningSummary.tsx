'use client';

import { useState } from 'react';
import type { FormattedCoverageWarnings } from '@/lib/schedule/coverageWarningFormatter';

type Props = {
  formatted: FormattedCoverageWarnings;
  /** Max summary lines in the main (non-details) area. Dashboard = 1, schedule = 3. */
  maxCompactLines?: number;
  onFocusDay?: (date: string) => void;
  viewDetailsLabel?: string;
  hideDetailsLabel?: string;
  className?: string;
  children?: React.ReactNode;
};

export function CoverageWarningSummary({
  formatted,
  maxCompactLines = 1,
  onFocusDay,
  viewDetailsLabel = 'View details',
  hideDetailsLabel = 'Hide details',
  className = '',
  children,
}: Props) {
  const [open, setOpen] = useState(false);

  if (!formatted.summaryLine) {
    return null;
  }

  const compact =
    maxCompactLines <= 1
      ? [formatted.summaryLine]
      : formatted.compactItems.length
        ? formatted.compactItems.slice(0, maxCompactLines)
        : [formatted.summaryLine];

  return (
    <div className={`rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2.5 ${className}`}>
      <div className="space-y-1">
        {compact.map((line) => (
          <p key={line} className="text-sm font-medium text-amber-950">
            {line}
          </p>
        ))}
      </div>

      {formatted.groupedByDay.length > 0 && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-2 text-xs font-medium text-amber-900 underline-offset-2 hover:underline"
        >
          {open ? hideDetailsLabel : viewDetailsLabel}
        </button>
      )}

      {open && (
        <div className="mt-3 space-y-3 border-t border-amber-200/80 pt-3">
          {formatted.groupedByDay.map((day) => (
            <div key={day.date}>
              <button
                type="button"
                onClick={() => onFocusDay?.(day.date)}
                className={`text-xs font-semibold text-amber-950 ${onFocusDay ? 'hover:underline' : ''}`}
              >
                {day.dayName ?? day.date}
              </button>
              <ul className="mt-1 space-y-1">
                {day.items.map((item, idx) => (
                  <li key={`${day.date}-${item.label}-${idx}`} className="text-xs text-amber-900">
                    <span className="font-medium">{item.label}</span>
                    {item.periodRange ? (
                      <span className="text-amber-800"> from {item.periodRange}</span>
                    ) : null}
                    {item.required != null && item.available != null ? (
                      <span className="block text-amber-800/90">
                        Required {item.required}, available {item.available}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {children}
        </div>
      )}
    </div>
  );
}
