'use client';

import { SimpleLineChart } from '../charts/SimpleLineChart';
import { SimpleBarChart } from '../charts/SimpleBarChart';
import type { SalesAnalytics } from '@/lib/analytics';
import type { Role } from '@prisma/client';
import { getRoleDisplayLabel } from '@/lib/roleLabel';

type Props = { data: SalesAnalytics; t: (key: string) => string };

export function SalesAnalyticsSection({ data, t }: Props) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-slate-800">
        {t('dashboard.sales.sectionTitle')}
      </h2>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-3">
          <p className="text-xs font-medium uppercase text-slate-500">{t('dashboard.sales.target')}</p>
          <p className="text-xl font-semibold text-slate-900">{data.target.toLocaleString()} SAR</p>
        </div>
        <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-3">
          <p className="text-xs font-medium uppercase text-slate-500">{t('dashboard.sales.actual')}</p>
          <p className="text-xl font-semibold text-slate-900">{data.actual.toLocaleString()} SAR</p>
        </div>
        <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-3">
          <p className="text-xs font-medium uppercase text-slate-500">{t('dashboard.sales.completionPct')}</p>
          <p className="text-xl font-semibold text-slate-900">{data.completionPct}%</p>
        </div>
        <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-3">
          <p className="text-xs font-medium uppercase text-slate-500">{t('dashboard.sales.gap')}</p>
          <p className="text-xl font-semibold text-slate-900">{data.gap.toLocaleString()} SAR</p>
        </div>
      </div>

      {data.dailyActuals.length > 0 && (
        <div className="mb-6">
          <h3 className="mb-2 text-sm font-semibold text-slate-600">{t('dashboard.sales.trend')}</h3>
          <SimpleLineChart
            data={data.dailyActuals.map((d) => ({ label: d.date, value: d.amount }))}
            height={200}
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-600">{t('dashboard.sales.distributionByRole')}</h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-0 text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-600">
                  <th className="py-2 pr-2">{t('common.name')}</th>
                  <th className="py-2 text-right">Actual</th>
                  <th className="py-2 text-right">%</th>
                </tr>
              </thead>
              <tbody>
                {data.byRole.map((r) => (
                  <tr key={r.role} className="border-b border-slate-100">
                    <td className="py-1.5 pr-2">{getRoleDisplayLabel(r.role as Role, null, t)}</td>
                    <td className="text-right">{r.actual.toLocaleString()}</td>
                    <td className="text-right">{r.pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-600">{t('dashboard.sales.distributionByEmployee')}</h3>
          <p className="mb-2 text-xs text-slate-500">{t('dashboard.sales.top5')}</p>
          <SimpleBarChart
            data={data.top5.map((e) => ({ label: e.name, value: e.actual }))}
            height={140}
            valueFormat={(n) => n.toLocaleString()}
          />
          <p className="mt-3 text-xs text-slate-500">{t('dashboard.sales.bottom5')}</p>
          <SimpleBarChart
            data={data.bottom5.map((e) => ({ label: e.name, value: e.actual }))}
            height={140}
            valueFormat={(n) => n.toLocaleString()}
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-4 text-sm text-slate-600">
        <span>
          {t('dashboard.sales.volatilityIndex')}:{' '}
          {data.volatilityIndex != null ? data.volatilityIndex.toFixed(2) : t('dashboard.sales.na')}
        </span>
        <span>
          MoM: {data.momComparison ?? t('dashboard.sales.na')}
        </span>
        <span>
          WoW: {data.wowComparison ?? t('dashboard.sales.na')}
        </span>
      </div>
    </section>
  );
}
