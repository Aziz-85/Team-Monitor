'use client';

import { OpsCard } from '@/components/ui/OpsCard';
import { ProgressBar } from '../cards/ProgressBar';
import { formatSarInt } from '@/lib/utils/money';
import { getPerformanceTextClassForComparison, getProgressBarVariant } from '@/lib/performanceColors';

type Row = { name: string; target: number; actual: number; pct: number };

/** Thresholds for employee contribution comparison (60/40). */
const COMPARISON_THRESHOLDS = { high: 60, mid: 40 };

export function SalesBreakdownSection({ employees }: { employees: Row[] }) {
  if (!employees?.length) return null;

  return (
    <OpsCard title="Sales Breakdown" className="rounded-2xl border border-border shadow-sm">
      <ul className="space-y-4">
        {employees.map((emp, i) => {
          const textClass = getPerformanceTextClassForComparison(emp.pct, COMPARISON_THRESHOLDS);
          const variant = getProgressBarVariant(emp.pct, COMPARISON_THRESHOLDS);
          return (
          <li key={i} className="border-b border-border pb-3 last:border-0 last:pb-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-foreground">{emp.name}</span>
              <span className={`text-sm font-semibold ${textClass}`}>
                {emp.pct}%
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs text-muted">
              <span>{formatSarInt(emp.actual)} / {formatSarInt(emp.target)}</span>
            </div>
            <div className="mt-1.5">
              <ProgressBar
                valuePct={emp.pct}
                variant={variant}
              />
            </div>
          </li>
          );
        })}
      </ul>
    </OpsCard>
  );
}
