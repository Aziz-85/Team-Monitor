'use client';

import { OpsCard } from '@/components/ui/OpsCard';
import { ProgressBar } from '../cards/ProgressBar';
import { formatSarInt } from '@/lib/utils/money';

type Row = { name: string; target: number; actual: number; pct: number };

export function SalesBreakdownSection({ employees }: { employees: Row[] }) {
  if (!employees?.length) return null;

  return (
    <OpsCard title="Sales Breakdown" className="rounded-2xl border border-border shadow-sm">
      <ul className="space-y-4">
        {employees.map((emp, i) => (
          <li key={i} className="border-b border-border pb-3 last:border-0 last:pb-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-foreground">{emp.name}</span>
              <span
                className={`text-sm font-semibold ${
                  emp.pct >= 60 ? 'text-foreground' : emp.pct >= 40 ? 'text-amber-600' : 'text-red-600'
                }`}
              >
                {emp.pct}%
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs text-muted">
              <span>{formatSarInt(emp.actual)} / {formatSarInt(emp.target)}</span>
            </div>
            <div className="mt-1.5">
              <ProgressBar
                valuePct={emp.pct}
                variant={emp.pct < 40 ? 'red' : emp.pct < 60 ? 'orange' : 'default'}
              />
            </div>
          </li>
        ))}
      </ul>
    </OpsCard>
  );
}
