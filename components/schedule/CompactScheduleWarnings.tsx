'use client';

import { useMemo } from 'react';
import type { SlotViolation } from '@/lib/schedule/generateSchedule/types';
import type { GroupedWarning } from '@/lib/schedule/scheduleUiMetrics';
import {
  formatCoverageWarnings,
  warningsFromSlotViolations,
  warningsFromValidationsByDay,
} from '@/lib/schedule/coverageWarningFormatter';
import { CoverageWarningSummary } from '@/components/schedule/CoverageWarningSummary';

type Props = {
  grouped: GroupedWarning[];
  validationsByDay: Array<{
    date: string;
    dayName?: string;
    dayOfWeek?: number;
    validations: Array<{
      type: string;
      message?: string;
      amCount?: number;
      pmCount?: number;
      minAm?: number;
      minPm?: number;
    }>;
  }>;
  slotViolations?: SlotViolation[];
  daysNeedingAttention: number;
  formatDate: (date: string) => string;
  onFocusDay?: (date: string) => void;
  t: (key: string) => string;
  maxCompactLines?: number;
};

export function CompactScheduleWarnings({
  grouped,
  validationsByDay,
  slotViolations = [],
  daysNeedingAttention,
  formatDate,
  onFocusDay,
  t,
  maxCompactLines = 3,
}: Props) {
  const coverageFormatted = useMemo(() => {
    const dayMeta = new Map(
      validationsByDay.map((d) => [
        d.date,
        { dayName: d.dayName ?? formatDate(d.date), dayOfWeek: d.dayOfWeek },
      ])
    );
    const withNames = validationsByDay.map((d) => ({
      ...d,
      dayName: d.dayName ?? formatDate(d.date),
    }));
    const bucket = warningsFromValidationsByDay(withNames);
    const slots = warningsFromSlotViolations(slotViolations, dayMeta);
    return formatCoverageWarnings([...bucket, ...slots]);
  }, [validationsByDay, slotViolations, formatDate]);

  const nonCoverage = grouped.filter((w) => w.group !== 'coverage');

  if (!coverageFormatted.summaryLine && daysNeedingAttention === 0 && nonCoverage.length === 0) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-sm text-emerald-900">
        {t('coverage.noWarnings')}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {coverageFormatted.summaryLine && (
        <CoverageWarningSummary
          formatted={coverageFormatted}
          maxCompactLines={maxCompactLines}
          onFocusDay={onFocusDay}
          viewDetailsLabel={(t('schedule.warnings.showDetails') as string) || 'View details'}
          hideDetailsLabel={(t('schedule.warnings.hideDetails') as string) || 'Hide details'}
        />
      )}

      {nonCoverage.length > 0 && (
        <div className="rounded-lg border border-border bg-surface p-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
            {t('schedule.warnings.otherIssues') || 'Other issues'}
          </h4>
          <ul className="mt-2 space-y-1">
            {nonCoverage.slice(0, 5).map((w) => (
              <li key={w.id} className="text-xs text-foreground">
                {w.date ? `${formatDate(w.date)} · ` : ''}
                {w.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
