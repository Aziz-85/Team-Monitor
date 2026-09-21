'use client';

import type { StoreReportPayload } from '@/lib/reports/storeReportService';
import { formatSarInt } from '@/lib/utils/money';
import { KpiCard } from '@/components/reports/KpiCard';
import { TeamPerformanceTable } from '@/components/reports/TeamPerformanceTable';

type Props = {
  data: StoreReportPayload['storeDetail'];
  meta: StoreReportPayload['meta'];
};

function pctStatus(pct: number, invert = false): 'positive' | 'negative' | 'warning' | 'neutral' {
  if (invert) {
    if (pct <= 10) return 'positive';
    if (pct <= 15) return 'warning';
    return 'negative';
  }
  if (pct >= 100) return 'positive';
  if (pct >= 80) return 'warning';
  return 'negative';
}

export function StoreDetailReport({ data, meta }: Props) {
  const { kpis, closingExpectation, teamPerformance, additionalKpis, teamHighlights } = data;
  const isMonth = meta.periodKind === 'month';
  const salesLabel = isMonth ? 'MTD Sales' : 'Period Sales';
  const performanceSubtitle = isMonth
    ? `MTD performance · ${meta.periodLabel} · as of ${meta.asOfDateKey}`
    : `${meta.periodLabel} · ${meta.asOfDateKey}`;

  return (
    <section className="report-section report-store-detail space-y-8">
      <header className="border-b border-slate-200 pb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#0F4C3A]">
          Section 1 — Store Detail Report
        </p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
          {meta.boutiqueName}
          <span className="ml-2 text-lg font-normal text-slate-500">({meta.boutiqueCode})</span>
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          {performanceSubtitle}
          {meta.regionName != null && ` · ${meta.regionName}`}
        </p>
      </header>

      <div>
        <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Top KPIs
        </h3>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard label={salesLabel} value={formatSarInt(kpis.mtdSales)} status="neutral" />
          <KpiCard
            label="vs Distributed Target"
            value={`${kpis.vsDistributedTargetPct}%`}
            subtitle={formatSarInt(kpis.distributedTarget)}
            status={pctStatus(kpis.vsDistributedTargetPct)}
          />
          <KpiCard
            label="vs Budget Target"
            value={`${kpis.vsBudgetTargetPct}%`}
            subtitle={formatSarInt(kpis.budgetTarget)}
            status={pctStatus(kpis.vsBudgetTargetPct)}
          />
          <KpiCard
            label="Discount"
            value={`${kpis.discountPct}%`}
            subtitle={`Target ≤ ${teamHighlights.discountTargetPct}%`}
            status={pctStatus(kpis.discountPct, true)}
          />
        </div>
      </div>

      {meta.showClosingExpectation && (
      <div>
        <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Closing Expectation
        </h3>
        <div className="grid gap-4 lg:grid-cols-5">
          <KpiCard
            label="MTD Performance"
            value={`${closingExpectation.mtdPerformancePct}%`}
            status={pctStatus(closingExpectation.mtdPerformancePct)}
          />
          <KpiCard
            label="Run Rate — Remaining Month"
            value={formatSarInt(closingExpectation.runRateRemainingMonth)}
            subtitle="Projected from current daily pace"
            status="neutral"
          />
          <KpiCard
            label="Pipeline Deals"
            value={formatSarInt(closingExpectation.pipelineDeals)}
            status="neutral"
          />
          <KpiCard
            label="Projected Closing"
            value={formatSarInt(closingExpectation.projectedClosing)}
            subtitle={`Target ${formatSarInt(closingExpectation.budgetTarget)}`}
            status={pctStatus(closingExpectation.projectedAchievementPct)}
          />
          <div className="flex flex-col justify-center rounded-lg border border-[#0F4C3A]/20 bg-[#0F4C3A]/5 p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#0F4C3A]">
              Projected Achievement
            </p>
            <p
              className={`mt-2 text-3xl font-semibold tabular-nums ${
                closingExpectation.projectedAchievementPct >= 100
                  ? 'text-emerald-700'
                  : closingExpectation.projectedAchievementPct >= 80
                    ? 'text-amber-600'
                    : 'text-red-600'
              }`}
            >
              {closingExpectation.projectedAchievementPct}%
            </p>
            <p className="mt-2 text-xs text-slate-600">
              MTD + run rate + pipeline vs budget target
            </p>
          </div>
        </div>
      </div>
      )}

      <TeamPerformanceTable
        rows={teamPerformance}
        discountTargetPct={teamHighlights.discountTargetPct}
      />

      <div>
        <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Additional KPIs
        </h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <KpiCard
            label="Footfall"
            value={additionalKpis.footfall != null ? additionalKpis.footfall.toLocaleString() : '—'}
            status="neutral"
          />
          <KpiCard
            label="Conversion Rate"
            value={
              additionalKpis.conversionRate != null ? `${additionalKpis.conversionRate}%` : '—'
            }
            status="neutral"
          />
          <KpiCard
            label="CRM Registration Rate"
            value={
              additionalKpis.crmRegistrationRate != null
                ? `${additionalKpis.crmRegistrationRate}%`
                : '—'
            }
            status="neutral"
          />
        </div>
      </div>

      <div className="report-highlight-panel rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900">Team Highlights</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg bg-emerald-50 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-800">
              Top Performer
            </p>
            <p className="mt-2 text-lg font-semibold text-emerald-900">
              {teamHighlights.topPerformer
                ? `${teamHighlights.topPerformer.name} — ${teamHighlights.topPerformer.achievementPct}%`
                : '—'}
            </p>
          </div>
          <div className="rounded-lg bg-red-50 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-red-800">
              Lagging Performer
            </p>
            <p className="mt-2 text-lg font-semibold text-red-900">
              {teamHighlights.laggingPerformer
                ? `${teamHighlights.laggingPerformer.name} — ${teamHighlights.laggingPerformer.achievementPct}%`
                : '—'}
            </p>
          </div>
          <div className="rounded-lg bg-slate-50 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-600">
              Above Target
            </p>
            <p className="mt-2 text-lg font-semibold text-slate-900">
              {teamHighlights.employeesAboveTarget} employees
            </p>
          </div>
          <div
            className={`rounded-lg p-4 ${
              teamHighlights.discountWarning ? 'bg-red-50' : 'bg-emerald-50'
            }`}
          >
            <p
              className={`text-[10px] font-semibold uppercase tracking-wider ${
                teamHighlights.discountWarning ? 'text-red-800' : 'text-emerald-800'
              }`}
            >
              Discount Status
            </p>
            <p
              className={`mt-2 text-lg font-semibold ${
                teamHighlights.discountWarning ? 'text-red-900' : 'text-emerald-900'
              }`}
            >
              {teamHighlights.discountWarning ? 'Above target — review' : 'Within target'}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
