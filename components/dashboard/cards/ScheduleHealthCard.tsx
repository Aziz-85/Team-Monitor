'use client';

import { SnapshotCard } from './SnapshotCard';

type Props = {
  weekApproved: boolean;
  todayAmCount: number;
  todayPmCount: number;
  coverageViolationsCount: number;
};

export function ScheduleHealthCard({
  weekApproved,
  todayAmCount,
  todayPmCount,
  coverageViolationsCount,
}: Props) {
  return (
    <SnapshotCard title="Schedule Health">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block h-2 w-2 shrink-0 rounded-full ${
              weekApproved ? 'bg-emerald-600' : 'bg-amber-600'
            }`}
            aria-hidden
          />
          <span className="text-sm font-medium text-slate-700">
            Current week: {weekApproved ? 'Approved' : 'Not approved'}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-slate-500">Today AM</span>
            <p className="text-lg font-semibold text-slate-900">{todayAmCount}</p>
          </div>
          <div>
            <span className="text-slate-500">Today PM</span>
            <p className="text-lg font-semibold text-slate-900">{todayPmCount}</p>
          </div>
        </div>
        {coverageViolationsCount > 0 && (
          <p className="text-sm font-medium text-amber-700">
            {coverageViolationsCount} coverage issue
            {coverageViolationsCount !== 1 ? 's' : ''} detected
          </p>
        )}
      </div>
    </SnapshotCard>
  );
}
