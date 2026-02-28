'use client';

import { ExecBullet } from '@/components/dashboard-ui/ExecBullet';
import { ExecKpiBlock } from '@/components/dashboard-ui/ExecKpiBlock';
import { ExecPanel } from '@/components/dashboard-ui/ExecPanel';
import { ExecTable } from '@/components/dashboard-ui/ExecTable';

/** Mock data only. No real services or data fetching. */
const MOCK_BOUTIQUE = 'S05';

export function ExecutiveDashboardLayout() {
  return (
    <div className="min-w-0 space-y-6">
      <header className="flex min-w-0 flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-slate-900">Executive Dashboard</h1>
          <p className="mt-0.5 text-sm text-slate-500">Working on: {MOCK_BOUTIQUE}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-sm text-slate-500">Mock data · UI only</span>
        </div>
      </header>

      <section className="grid min-w-0 grid-cols-12 gap-4">
        <div className="col-span-12 min-w-0 md:col-span-6 xl:col-span-3">
          <ExecKpiBlock
            title="Monthly Sales Performance"
            actualLabel="Actual"
            actual="124,500 SAR"
            targetLabel="Target"
            target="388,385 SAR"
            variance="-263,885 SAR"
            variancePct="-67.9%"
            compareLabel="WoW"
            compareValue="+6.2% vs prev 7d"
            status="ok"
            footnote="Definition: Net sales = SUM(netAmount). Period: MTD. Comparator: last 7d vs prev 7d."
            bullet={
              <ExecBullet
                value={124500}
                target={388385}
                max={400000}
                height={20}
              />
            }
          />
        </div>
        <div className="col-span-12 min-w-0 md:col-span-6 xl:col-span-3">
          <ExecKpiBlock
            title="Target Achievement %"
            actualLabel="Actual"
            actual="67%"
            targetLabel="Benchmark"
            target="100%"
            variance="-33%"
            variancePct="-33 pp"
            compareLabel="WoW"
            compareValue="+2.1 pp vs prev 7d"
            status="watch"
            footnote="Definition: (Actual sales / Target sales) × 100. Period: MTD. Comparator: same period prior week."
            bullet={
              <ExecBullet
                value={67}
                target={100}
                max={100}
                thresholds={{ good: 90, watch: 70 }}
                height={20}
              />
            }
          />
        </div>
        <div className="col-span-12 min-w-0 md:col-span-6 xl:col-span-3">
          <ExecKpiBlock
            title="Schedule Health"
            actualLabel="Compliance"
            actual="94%"
            targetLabel="Target"
            target="95%"
            variance="-1%"
            variancePct="-1 pp"
            compareLabel="WoW"
            compareValue="+0.5 pp vs prev 7d"
            status="ok"
            footnote="Definition: % of shifts filled per plan. Period: YTD. Comparator: last 7d vs prev 7d."
            bullet={
              <ExecBullet
                value={94}
                target={95}
                max={100}
                thresholds={{ good: 95, watch: 85 }}
                height={20}
              />
            }
          />
        </div>
        <div className="col-span-12 min-w-0 md:col-span-6 xl:col-span-3">
          <ExecKpiBlock
            title="Task Control"
            actualLabel="Backlog"
            actual="6"
            targetLabel="Target"
            target="<8"
            variance="—"
            compareLabel="Aging"
            compareValue="<2d avg"
            status="ok"
            footnote="Definition: Open tasks pending. Period: current. Aging: average days in backlog."
            bullet={
              <ExecBullet
                value={6}
                target={8}
                max={24}
                thresholds={{ good: 8, watch: 16 }}
                height={20}
              />
            }
          />
        </div>
      </section>

      <section className="min-w-0">
        <ExecPanel title="Sales Breakdown">
          <ul className="space-y-4">
            {[
              { name: 'Category A', percent: 35 },
              { name: 'Category B', percent: 28 },
              { name: 'Category C', percent: 22 },
              { name: 'Category D', percent: 15 },
            ].map((row, i) => {
              const isWeak = row.percent < 20;
              return (
                <li key={i} className="min-w-0 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-sm font-medium text-slate-900">
                      {row.name}
                    </span>
                    <span
                      className={`shrink-0 text-sm tabular-nums ${isWeak ? 'text-amber-700' : 'text-slate-900'}`}
                    >
                      {row.percent}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-blue-700"
                      style={{ width: `${row.percent}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </ExecPanel>
      </section>

      <section className="grid min-w-0 grid-cols-12 gap-4">
        <div className="col-span-12 min-w-0 xl:col-span-8">
          <ExecPanel title="Performance Overview" subtitle="Placeholder for charts">
            <div className="flex h-40 items-center justify-center rounded-lg border border-slate-200 bg-slate-50">
              <span className="text-sm text-slate-500">Chart area</span>
            </div>
          </ExecPanel>
        </div>
        <div className="col-span-12 flex min-w-0 flex-col gap-4 xl:col-span-4">
          <ExecPanel title="Top Performers">
            <ul className="space-y-2 text-sm">
              {[
                { name: 'Sarah M.', sales: '18,200' },
                { name: 'Layla A.', sales: '16,800' },
                { name: 'Nora K.', sales: '15,400' },
              ].map((p, i) => (
                <li key={i} className="flex justify-between gap-2 text-slate-900">
                  <span className="min-w-0 truncate">{p.name}</span>
                  <span className="shrink-0 tabular-nums text-slate-500">{p.sales} SAR</span>
                </li>
              ))}
            </ul>
          </ExecPanel>
          <ExecPanel title="Operational Alerts">
            <ul className="space-y-2 text-sm">
              {[
                { text: 'Schedule approval pending for week 13', time: '2h ago' },
                { text: 'Leave request from 3 employees', time: '5h ago' },
              ].map((a, i) => (
                <li key={i} className="text-slate-900">
                  <p>{a.text}</p>
                  <p className="text-xs text-slate-500">{a.time}</p>
                </li>
              ))}
            </ul>
          </ExecPanel>
        </div>
      </section>

      <section className="min-w-0">
        <ExecPanel title="Recent Transactions">
          <ExecTable
            columns={[
              { key: 'date', label: 'Date', align: 'left' },
              { key: 'employee', label: 'Employee', align: 'left' },
              { key: 'type', label: 'Type', align: 'left' },
              { key: 'amount', label: 'Amount (SAR)', align: 'right' },
            ]}
            data={[
              { date: '2025-02-25', employee: 'Sarah M.', type: 'SALE', amount: '2,450' },
              { date: '2025-02-25', employee: 'Layla A.', type: 'SALE', amount: '1,890' },
              { date: '2025-02-24', employee: 'Nora K.', type: 'RETURN', amount: '-320' },
              { date: '2025-02-24', employee: 'Omar F.', type: 'SALE', amount: '3,100' },
              { date: '2025-02-23', employee: 'Sarah M.', type: 'EXCHANGE', amount: '0' },
            ]}
          />
        </ExecPanel>
      </section>
    </div>
  );
}
