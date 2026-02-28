'use client';

import { OpsCard } from '@/components/ui/OpsCard';

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
  return (
    <OpsCard title="Schedule Overview" className="rounded-2xl border border-slate-200 shadow-sm">
      <div className="space-y-3">
        <p className="text-sm font-medium text-slate-700">
          AM/PM balance: <span className="text-slate-900">{amPmBalanceSummary}</span>
        </p>
        {imbalanceHighlight && (
          <p className="text-sm font-medium text-amber-700">AM exceeds PM — imbalance highlighted</p>
        )}
        {daysOverloaded?.length > 0 && (
          <ul className="list-inside list-disc space-y-1 text-sm text-slate-600">
            {daysOverloaded.map((msg, i) => (
              <li key={i}>{msg}</li>
            ))}
          </ul>
        )}
      </div>
    </OpsCard>
  );
}
