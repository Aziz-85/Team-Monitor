'use client';

import { SnapshotCard } from './SnapshotCard';

type Props = {
  suspiciousCount: number;
  leaveConflictsCount: number;
  unapprovedWeekWarning: boolean;
  lastPlannerSync: string | null;
  showPlannerSync: boolean;
};

export function ControlAlertsCard({
  suspiciousCount,
  leaveConflictsCount,
  unapprovedWeekWarning,
  lastPlannerSync,
  showPlannerSync,
}: Props) {
  const items: string[] = [];
  if (suspiciousCount > 0) items.push(`${suspiciousCount} suspicious completion(s)`);
  if (leaveConflictsCount > 0) items.push(`${leaveConflictsCount} leave conflict(s)`);
  if (unapprovedWeekWarning) items.push('Unapproved week');
  if (showPlannerSync && lastPlannerSync) {
    try {
      const d = new Date(lastPlannerSync);
      items.push(`Last planner sync: ${d.toLocaleDateString(undefined, { dateStyle: 'short' })}`);
    } catch {
      items.push('Planner synced');
    }
  }

  return (
    <SnapshotCard title="Control & Alerts">
      <div className="space-y-2">
        {items.length === 0 ? (
          <p className="text-sm text-slate-500">No alerts</p>
        ) : (
          <ul className="space-y-1.5">
            {items.map((text, i) => (
              <li key={i} className="flex items-center gap-2 text-sm text-slate-700">
                <span className="text-amber-500" aria-hidden>⚠</span>
                {text}
              </li>
            ))}
          </ul>
        )}
      </div>
    </SnapshotCard>
  );
}
