'use client';

import { SnapshotCard } from './SnapshotCard';

type Props = {
  totalWeekly: number;
  completed: number;
  pending: number;
  overdue: number;
  zoneStatusSummary: string;
};

export function TaskControlCard({
  totalWeekly,
  completed,
  pending,
  overdue,
  zoneStatusSummary,
}: Props) {
  return (
    <SnapshotCard title="Task Control">
      <div className="space-y-3">
        <div className="text-2xl font-semibold text-slate-900">
          {totalWeekly} <span className="text-base font-normal text-slate-500">weekly tasks</span>
        </div>
        <ul className="space-y-1 text-sm text-slate-700">
          <li>
            <strong>{completed}</strong> completed
          </li>
          <li>
            <strong>{pending}</strong> pending
          </li>
          {overdue > 0 && (
            <li className="font-medium text-red-600">
              <strong>{overdue}</strong> overdue
            </li>
          )}
        </ul>
        <p className="border-t border-slate-100 pt-2 text-xs text-slate-500">
          Zone inventory: {zoneStatusSummary}
        </p>
      </div>
    </SnapshotCard>
  );
}
