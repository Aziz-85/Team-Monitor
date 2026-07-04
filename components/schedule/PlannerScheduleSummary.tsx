'use client';

import type { EmployeeWeekSummary } from '@/lib/schedule/generateSchedule/types';

type Props = {
  summaries: EmployeeWeekSummary[];
  t: (key: string) => string;
};

export function PlannerScheduleSummary({ summaries, t }: Props) {
  const tr = (key: string, fallback: string) => (t(key) as string) || fallback;
  if (!summaries.length) return null;

  return (
    <div className="rounded-xl border border-teal-200 bg-teal-50/40 p-4">
      <h2 className="text-sm font-semibold text-teal-950">
        {tr('schedule.v3.plannerSummary.title', 'Planner-guided schedule')}
      </h2>
      <p className="mt-0.5 text-xs text-teal-900/70">
        {tr('schedule.v3.plannerSummary.subtitle', 'Weekly shift mix per employee')}
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-xs">
          <thead>
            <tr className="text-muted">
              <th className="py-1.5 pe-3 font-medium">{tr('schedule.v3.plannerSummary.employee', 'Employee')}</th>
              <th className="py-1.5 pe-3 font-medium text-center">{tr('schedule.v3.plannerSummary.am', 'AM')}</th>
              <th className="py-1.5 pe-3 font-medium text-center">{tr('schedule.v3.plannerSummary.pm', 'PM')}</th>
              <th className="py-1.5 pe-3 font-medium text-center">{tr('schedule.v3.plannerSummary.bridge', 'Bridge')}</th>
              <th className="py-1.5 pe-3 font-medium text-center">{tr('schedule.v3.plannerSummary.leave', 'Leave')}</th>
              <th className="py-1.5 pe-3 font-medium text-center">{tr('schedule.v3.plannerSummary.off', 'Off')}</th>
              <th className="py-1.5 pe-3 font-medium text-center">{tr('schedule.v3.plannerSummary.totalHours', 'Total h')}</th>
              <th className="py-1.5 pe-3 font-medium text-center">{tr('schedule.v3.plannerSummary.compensation', 'Owed')}</th>
            </tr>
          </thead>
          <tbody>
            {summaries.map((s) => (
              <tr key={s.empId} className="border-t border-teal-200/50">
                <td className="py-1.5 pe-3 font-medium text-foreground">{s.name}</td>
                <td className="py-1.5 pe-3 text-center font-mono">{s.amDays}</td>
                <td className="py-1.5 pe-3 text-center font-mono">{s.pmDays}</td>
                <td className="py-1.5 pe-3 text-center font-mono">{s.bridgeDays}</td>
                <td className="py-1.5 pe-3 text-center font-mono">{s.leaveDays}</td>
                <td className="py-1.5 pe-3 text-center font-mono">{s.offDays}</td>
                <td className="py-1.5 pe-3 text-center font-mono">{Math.round(s.totalHours * 10) / 10}</td>
                <td className="py-1.5 pe-3 text-center font-mono font-semibold text-amber-800">
                  {s.compensationOwedHours > 0 ? `${s.compensationOwedHours}h` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
