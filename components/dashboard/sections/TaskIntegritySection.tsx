'use client';

import { OpsCard } from '@/components/ui/OpsCard';

type Props = {
  burstFlagsCount: number;
  sameDayBulkCount: number;
  top3SuspiciousUsers: string[];
};

export function TaskIntegritySection({
  burstFlagsCount,
  sameDayBulkCount,
  top3SuspiciousUsers,
}: Props) {
  return (
    <OpsCard title="Task Integrity" className="rounded-2xl border border-slate-200 shadow-sm">
      <div className="space-y-3">
        <p className="text-sm text-slate-700">
          Burst flags: <strong>{burstFlagsCount}</strong>
        </p>
        <p className="text-sm text-slate-700">
          Same-day bulk closures: <strong>{sameDayBulkCount}</strong>
        </p>
        {top3SuspiciousUsers?.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
              Top 3 suspicious
            </p>
            <ul className="list-inside list-disc text-sm text-slate-700">
              {top3SuspiciousUsers.map((name, i) => (
                <li key={i}>{name}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </OpsCard>
  );
}
