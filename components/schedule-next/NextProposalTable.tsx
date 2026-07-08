'use client';

import type { ScheduleNextProposalRow } from '@/lib/schedule-next/types';
import { useT } from '@/lib/i18n/useT';

type Person = ScheduleNextProposalRow['morning'][number];

function PersonCell({ people }: { people: Person[] }) {
  if (!people.length) return <span className="text-xs text-muted">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {people.map((p) => (
        <span
          key={`${p.empId}-${p.kind}`}
          className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-subtle px-2 py-0.5 text-xs font-medium"
        >
          {p.name}
          {p.kind === 'Bridge' && (
            <span className="rounded bg-orange-200/80 px-1 text-[9px] font-bold uppercase tracking-wide text-orange-900">
              BRIDGE
            </span>
          )}
          {p.movedWeeklyOff && (
            <span className="rounded bg-amber-200/80 px-1 text-[9px] font-bold uppercase tracking-wide text-amber-900">
              OFF MOVED
            </span>
          )}
          {p.compensationRequired && (
            <span className="rounded bg-violet-200/80 px-1 text-[9px] font-bold uppercase tracking-wide text-violet-900">
              COMP REQUIRED
            </span>
          )}
        </span>
      ))}
    </div>
  );
}

function statusTone(status: ScheduleNextProposalRow['status']): string {
  switch (status) {
    case 'OK':
      return 'text-emerald-700';
    case 'Needs AM':
    case 'Needs PM':
      return 'text-amber-700';
    case 'Needs Support':
      return 'text-violet-700';
    default:
      return 'text-rose-700';
  }
}

type Props = {
  rows: ScheduleNextProposalRow[];
};

export function NextProposalTable({ rows }: Props) {
  const { t } = useT();
  const tr = (key: string, fallback: string) => (t(key) as string) || fallback;

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="min-w-full divide-y divide-border text-sm">
        <thead className="bg-surface-subtle">
          <tr>
            <th className="px-3 py-2 text-start font-semibold">{tr('scheduleNext.colDate', 'Date')}</th>
            <th className="px-3 py-2 text-start font-semibold">{tr('scheduleNext.colDay', 'Day')}</th>
            <th className="px-3 py-2 text-start font-semibold">{tr('scheduleNext.colMorning', 'Morning AM')}</th>
            <th className="px-3 py-2 text-start font-semibold">{tr('scheduleNext.colAfternoon', 'Afternoon PM')}</th>
            <th className="px-3 py-2 text-start font-semibold">{tr('scheduleNext.colExternal', 'External Coverage')}</th>
            <th className="px-3 py-2 text-center font-semibold">{tr('scheduleNext.colAm', 'AM')}</th>
            <th className="px-3 py-2 text-center font-semibold">{tr('scheduleNext.colPm', 'PM')}</th>
            <th className="px-3 py-2 text-start font-semibold">{tr('scheduleNext.colStatus', 'Status')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border bg-surface">
          {rows.map((row) => (
            <tr key={row.date}>
              <td className="whitespace-nowrap px-3 py-2 font-medium">{row.date}</td>
              <td className="whitespace-nowrap px-3 py-2">{row.dayName}</td>
              <td className="px-3 py-2">
                <PersonCell people={row.morning} />
              </td>
              <td className="px-3 py-2">
                <PersonCell people={row.afternoon} />
              </td>
              <td className="px-3 py-2">
                <PersonCell people={row.externalCoverage} />
              </td>
              <td className="px-3 py-2 text-center font-semibold">{row.amCount}</td>
              <td className="px-3 py-2 text-center font-semibold">{row.pmCount}</td>
              <td className={`px-3 py-2 font-medium ${statusTone(row.status)}`}>{row.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
