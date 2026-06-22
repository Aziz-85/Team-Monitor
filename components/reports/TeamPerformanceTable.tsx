'use client';

import type { TeamPerformanceRow } from '@/lib/reports/storeReportService';
import { formatSarInt } from '@/lib/utils/money';

type Props = {
  rows: TeamPerformanceRow[];
  discountTargetPct: number;
};

function achievementClass(pct: number): string {
  if (pct >= 100) return 'text-emerald-700 font-semibold';
  if (pct >= 80) return 'text-amber-600 font-medium';
  return 'text-red-600 font-semibold';
}

function discountClass(pct: number | null, target: number): string {
  if (pct == null) return 'text-slate-500';
  if (pct > target) return 'text-red-600 font-semibold';
  return 'text-slate-700';
}

export function TeamPerformanceTable({ rows, discountTargetPct }: Props) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-slate-50/80 px-5 py-3">
        <h3 className="text-sm font-semibold tracking-tight text-slate-900">
          Sales Team Performance
        </h3>
        <p className="text-xs text-slate-500">Month-to-date achievement by employee</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              <th className="px-5 py-3">Employee</th>
              <th className="px-5 py-3 text-right">Target</th>
              <th className="px-5 py-3 text-right">Actual</th>
              <th className="px-5 py-3 text-right">Achievement</th>
              <th className="px-5 py-3 text-right">Discount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.userId}
                className={`border-b border-slate-50 last:border-0 ${
                  row.isTotal ? 'bg-[#0F4C3A]/5 font-semibold' : 'hover:bg-slate-50/60'
                }`}
              >
                <td className="px-5 py-3 text-slate-900">{row.employeeName}</td>
                <td className="px-5 py-3 text-right tabular-nums text-slate-700">
                  {formatSarInt(row.target)}
                </td>
                <td className="px-5 py-3 text-right tabular-nums text-slate-900">
                  {formatSarInt(row.actual)}
                </td>
                <td className={`px-5 py-3 text-right tabular-nums ${achievementClass(row.achievementPct)}`}>
                  {row.achievementPct}%
                </td>
                <td
                  className={`px-5 py-3 text-right tabular-nums ${discountClass(row.discountPct, discountTargetPct)}`}
                >
                  {row.discountPct != null ? `${row.discountPct}%` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
