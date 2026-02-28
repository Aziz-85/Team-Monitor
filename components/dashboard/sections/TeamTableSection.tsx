'use client';

import { OpsCard } from '@/components/ui/OpsCard';
import { formatSarFromHalala } from '@/lib/utils/money';

type Row = {
  empId?: string;
  employee: string;
  role: string;
  roleLabel?: string;
  target: number;
  actual: number;
  pct: number;
  tasksDone: number;
  late: number;
  zone: string | null;
};

export function TeamTableSection({ rows }: { rows: Row[] }) {
  if (!rows?.length) return null;

  return (
    <OpsCard title="Team" className="overflow-hidden rounded-2xl border border-slate-200 shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-0 border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="px-3 py-2 text-left font-semibold text-slate-700">Employee</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-700">Role</th>
              <th className="px-3 py-2 text-right font-semibold text-slate-700">Target</th>
              <th className="px-3 py-2 text-right font-semibold text-slate-700">Actual</th>
              <th className="px-3 py-2 text-right font-semibold text-slate-700">%</th>
              <th className="px-3 py-2 text-right font-semibold text-slate-700">Tasks</th>
              <th className="px-3 py-2 text-right font-semibold text-slate-700">Late</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-700">Zone</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.empId ?? r.employee} className="border-b border-slate-100 last:border-0">
                <td className="px-3 py-2 font-medium text-slate-900">{r.employee}</td>
                <td className="px-3 py-2">
                  <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                    {r.roleLabel ?? r.role}
                  </span>
                </td>
                <td className="px-3 py-2 text-right text-slate-700">{formatSarFromHalala(r.target)}</td>
                <td className="px-3 py-2 text-right text-slate-700">{formatSarFromHalala(r.actual)}</td>
                <td
                  className={`px-3 py-2 text-right font-medium ${
                    r.pct >= 60 ? 'text-slate-900' : r.pct >= 40 ? 'text-amber-600' : 'text-red-600'
                  }`}
                >
                  {r.pct}%
                </td>
                <td className="px-3 py-2 text-right text-slate-700">{r.tasksDone}</td>
                <td className="px-3 py-2 text-right text-slate-700">{r.late}</td>
                <td className="px-3 py-2 text-slate-600">{r.zone ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </OpsCard>
  );
}
