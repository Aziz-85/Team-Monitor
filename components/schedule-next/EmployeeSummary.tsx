'use client';

import type { ScheduleNextProposal } from '@/lib/schedule-next/types';

type Props = {
  proposal: ScheduleNextProposal;
  t: (key: string) => string;
};

export function EmployeeSummary({ proposal, t }: Props) {
  const tr = (key: string, fallback: string) => (t(key) as string) || fallback;
  if (!proposal.employeeSummary.length) return null;

  return (
    <details className="rounded-xl border border-border bg-surface-subtle p-4">
      <summary className="cursor-pointer text-sm font-semibold text-foreground">
        {tr('scheduleNext.employeeSummary', 'Employee summary')}
      </summary>
      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-muted">
              <th className="px-2 py-1 text-start">{tr('scheduleNext.empName', 'Employee')}</th>
              <th className="px-2 py-1 text-end">{tr('scheduleNext.empHours', 'Hours')}</th>
              <th className="px-2 py-1 text-end">{tr('scheduleNext.empBridge', 'Bridge')}</th>
              <th className="px-2 py-1 text-end">{tr('scheduleNext.empComp', 'Comp +hrs')}</th>
            </tr>
          </thead>
          <tbody>
            {proposal.employeeSummary.map((e) => (
              <tr key={e.empId} className="border-t border-border">
                <td className="px-2 py-1">{e.name}</td>
                <td className="px-2 py-1 text-end">{e.totalHours}</td>
                <td className="px-2 py-1 text-end">{e.bridgeCount}</td>
                <td className="px-2 py-1 text-end">{e.compensationHours}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
