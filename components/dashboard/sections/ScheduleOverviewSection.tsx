'use client';

import { useMemo } from 'react';
import { OpsCard } from '@/components/ui/OpsCard';
import { CoverageWarningSummary } from '@/components/schedule/CoverageWarningSummary';
import {
  formatCoverageWarnings,
  warningsFromWeekSummary,
} from '@/lib/schedule/coverageWarningFormatter';

type Props = {
  amPmBalanceSummary: string;
  daysOverloaded: string[];
  imbalanceHighlight: boolean;
};

export function ScheduleOverviewSection({
  amPmBalanceSummary,
  daysOverloaded,
  imbalanceHighlight,
}: Props) {
  const formatted = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return formatCoverageWarnings(
      warningsFromWeekSummary([{ date: today, dayName: 'Today', messages: daysOverloaded }])
    );
  }, [daysOverloaded]);

  return (
    <OpsCard title="Schedule Overview" className="rounded-2xl border border-border shadow-sm">
      <div className="space-y-3">
        <p className="text-sm font-medium text-foreground">
          AM/PM balance: <span className="text-foreground">{amPmBalanceSummary}</span>
        </p>
        {imbalanceHighlight && (
          <p className="text-sm font-medium text-amber-700">AM exceeds PM — review afternoon coverage</p>
        )}
        {formatted.summaryLine ? (
          <CoverageWarningSummary formatted={formatted} maxCompactLines={1} />
        ) : daysOverloaded.length > 0 ? (
          <p className="text-sm text-muted">Coverage is acceptable today.</p>
        ) : null}
      </div>
    </OpsCard>
  );
}
