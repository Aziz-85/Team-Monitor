'use client';

import { SimpleLineChart } from '../charts/SimpleLineChart';
import { SimpleBarChart } from '../charts/SimpleBarChart';
import type { SalesAnalytics } from '@/lib/analytics';
import type { Role } from '@prisma/client';
import { getRoleDisplayLabel } from '@/lib/roleLabel';
import {
  DataTable,
  DataTableHead,
  DataTableTh,
  DataTableBody,
  DataTableTd,
} from '@/components/ui/DataTable';

type Props = { data: SalesAnalytics; t: (key: string) => string };

export function SalesAnalyticsSection({ data, t }: Props) {
  return (
    <section className="rounded-xl border border-border bg-surface p-5 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-foreground">
        {t('dashboard.sales.sectionTitle')}
      </h2>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded-lg border border-border bg-surface-subtle/50 p-3">
          <p className="text-xs font-medium uppercase text-muted">{t('dashboard.sales.target')}</p>
          <p className="text-xl font-semibold text-foreground">{data.target.toLocaleString()} SAR</p>
        </div>
        <div className="rounded-lg border border-border bg-surface-subtle/50 p-3">
          <p className="text-xs font-medium uppercase text-muted">{t('dashboard.sales.actual')}</p>
          <p className="text-xl font-semibold text-foreground">{data.actual.toLocaleString()} SAR</p>
        </div>
        <div className="rounded-lg border border-border bg-surface-subtle/50 p-3">
          <p className="text-xs font-medium uppercase text-muted">{t('dashboard.sales.completionPct')}</p>
          <p className="text-xl font-semibold text-foreground">{data.completionPct}%</p>
        </div>
        <div className="rounded-lg border border-border bg-surface-subtle/50 p-3">
          <p className="text-xs font-medium uppercase text-muted">{t('dashboard.sales.gap')}</p>
          <p className="text-xl font-semibold text-foreground">{data.gap.toLocaleString()} SAR</p>
        </div>
      </div>

      {data.dailyActuals.length > 0 && (
        <div className="mb-6">
          <h3 className="mb-2 text-sm font-semibold text-foreground">{t('dashboard.sales.trend')}</h3>
          <SimpleLineChart
            data={data.dailyActuals.map((d) => ({ label: d.date, value: d.amount }))}
            height={200}
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold text-foreground">{t('dashboard.sales.distributionByRole')}</h3>
          <DataTable variant="luxury" zebra noScroll>
            <DataTableHead>
              <DataTableTh className="text-start">{t('common.name')}</DataTableTh>
              <DataTableTh className="text-end">Actual</DataTableTh>
              <DataTableTh className="text-end">%</DataTableTh>
            </DataTableHead>
            <DataTableBody>
              {data.byRole.map((r) => (
                <tr key={r.role}>
                  <DataTableTd>{getRoleDisplayLabel(r.role as Role, null, t)}</DataTableTd>
                  <DataTableTd className="text-end">{r.actual.toLocaleString()}</DataTableTd>
                  <DataTableTd className="text-end">{r.pct}%</DataTableTd>
                </tr>
              ))}
            </DataTableBody>
          </DataTable>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold text-foreground">{t('dashboard.sales.distributionByEmployee')}</h3>
          <p className="mb-2 text-xs text-muted">{t('dashboard.sales.top5')}</p>
          <SimpleBarChart
            data={data.top5.map((e) => ({ label: e.name, value: e.actual }))}
            height={140}
            valueFormat={(n) => n.toLocaleString()}
          />
          <p className="mt-3 text-xs text-muted">{t('dashboard.sales.bottom5')}</p>
          <SimpleBarChart
            data={data.bottom5.map((e) => ({ label: e.name, value: e.actual }))}
            height={140}
            valueFormat={(n) => n.toLocaleString()}
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-4 text-sm text-muted">
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
