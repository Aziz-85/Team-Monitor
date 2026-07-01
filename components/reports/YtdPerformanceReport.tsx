'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { StoreReportPayload } from '@/lib/reports/storeReportService';
import { formatSarInt } from '@/lib/utils/money';
import { ExecutiveSummary } from '@/components/reports/ExecutiveSummary';
import { RechartsSizedContainer } from '@/components/charts/RechartsSizedContainer';

type Props = {
  data: StoreReportPayload['ytdPerformance'];
  meta: StoreReportPayload['meta'];
};

const CY_COLOR = '#0F4C3A';
const LY_COLOR = '#94A3B8';
const TARGET_COLOR = '#C6A756';

function formatChartSar(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return String(value);
}

type ChartBlockProps = {
  title: string;
  subtitle: string;
  points: StoreReportPayload['ytdPerformance']['charts']['boutiqueMonthly'];
};

function YtdBarChart({ title, subtitle, points }: ChartBlockProps) {
  const chartData = points.map((p) => ({
    name: p.label,
    'Current Year': p.currentYear,
    'Last Year': p.lastYear,
    Target: p.target,
  }));

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm print:break-inside-avoid">
      <h4 className="text-sm font-semibold text-slate-900">{title}</h4>
      <p className="text-xs text-slate-500">{subtitle}</p>
      <div className="mt-4 print:h-64">
        {chartData.length === 0 ? (
          <div className="flex h-72 items-center justify-center text-sm text-slate-400">
            No YTD data available
          </div>
        ) : (
          <RechartsSizedContainer className="h-72 w-full min-w-0">
            {({ width, height }) => (
              <ResponsiveContainer width={width} height={height}>
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    axisLine={{ stroke: '#e2e8f0' }}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={formatChartSar}
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={48}
                  />
                  <Tooltip
                    formatter={(value) => formatSarInt(Number(value ?? 0))}
                    contentStyle={{
                      borderRadius: 8,
                      border: '1px solid #e2e8f0',
                      fontSize: 12,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                  <Bar dataKey="Current Year" fill={CY_COLOR} radius={[3, 3, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="Last Year" fill={LY_COLOR} radius={[3, 3, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="Target" fill={TARGET_COLOR} radius={[3, 3, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </RechartsSizedContainer>
        )}
      </div>
    </div>
  );
}

export function YtdPerformanceReport({ data, meta }: Props) {
  const isMonth = meta.periodKind === 'month';
  const sectionLabel = isMonth ? 'Section 2 — YTD Performance' : 'Section 2 — Period Performance';
  const title = isMonth ? 'Year-to-Date Executive Summary' : `${meta.periodLabel} Executive Summary`;
  const subtitle = isMonth
    ? `Calendar year ${meta.periodYear} · through ${meta.asOfDateKey}`
    : `${meta.periodLabel} · through ${meta.asOfDateKey}`;
  const targetLabel = isMonth ? 'Target YTD' : 'Period Target';

  return (
    <section className="space-y-8">
      <header className="border-b border-slate-200 pb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#0F4C3A]">
          {sectionLabel}
        </p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
          {title}
        </h2>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <ExecutiveSummary
          title="This Boutique"
          revenueYtd={data.boutique.revenueYtd}
          vsLastYearPct={data.boutique.vsLastYearPct}
          pctOfTarget={data.boutique.pctOfTarget}
          subtitle={`${targetLabel} ${formatSarInt(data.boutique.targetYtd)}`}
        />
        <ExecutiveSummary
          title={data.zone.zoneName != null ? `Zone — ${data.zone.zoneName}` : 'Zone Comparison'}
          revenueYtd={data.zone.revenueYtd}
          vsLastYearPct={data.zone.vsLastYearPct}
          pctOfTarget={data.zone.pctOfTarget}
          subtitle={`${targetLabel} ${formatSarInt(data.zone.targetYtd)}`}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <YtdBarChart
          title="Boutique Monthly Performance"
          subtitle="Current year vs last year vs monthly target"
          points={data.charts.boutiqueMonthly}
        />
        <YtdBarChart
          title="Zone Monthly Performance"
          subtitle={
            data.zone.zoneName != null
              ? `${data.zone.zoneName} — aggregated boutiques`
              : 'Regional zone aggregate'
          }
          points={data.charts.zoneMonthly}
        />
      </div>

      <div className="rounded-xl border border-[#0F4C3A]/20 bg-gradient-to-br from-white to-[#0F4C3A]/5 p-6 shadow-sm print:break-inside-avoid">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-[#0F4C3A]">
          Executive Snapshot
        </h3>
        <div className="mt-4 space-y-3">
          <p className="text-base leading-relaxed text-slate-800">{data.snapshot.boutiqueText}</p>
          <p className="text-base leading-relaxed text-slate-800">{data.snapshot.zoneText}</p>
        </div>
      </div>
    </section>
  );
}
