'use client';

import { useEffect, useState } from 'react';
import { ExecutiveLineChart } from '@/components/executive/ExecutiveLineChart';
import { ExecutiveBarChart } from '@/components/executive/ExecutiveBarChart';

const GOLD = '#C6A756';

type KPIs = {
  revenue: number;
  target: number;
  achievementPct: number;
  overdueTasksPct: number;
  scheduleBalancePct: number;
  riskIndex: number;
  revenueDelta: number | null;
  targetDelta: number | null;
};

type ExecutiveData = {
  kpis: KPIs;
  salesVsTargetTrend: { label: string; sales: number; target: number }[];
  taskCompletionBreakdown: { label: string; value: number }[];
  zoneCompliance: { zone: string; rate: number }[];
  antiGamingSummary: { burstCount: number; sameDayBulkCount: number; topSuspicious: string[] };
  latestScheduleEdits: { id: string; weekStart: string; editedAt: string; editorName: string }[];
  topPerformer: { name: string; completedCount: number } | null;
  showRiskPanel: boolean;
  boutiqueScore?: { score: number; classification: string; components?: Record<string, number> };
};

function pctColor(pct: number): string {
  if (pct >= 90) return 'text-emerald-600';
  if (pct >= 20) return 'text-slate-600';
  return 'text-amber-700';
}

function KPICard({
  title,
  value,
  delta,
  pct,
  showPctBar,
}: {
  title: string;
  value: string | number;
  delta?: string | null;
  pct?: number;
  showPctBar?: boolean;
}) {
  const colorClass = pct != null ? pctColor(pct) : 'text-gray-800';
  return (
    <div className="rounded-2xl border border-[#E8DFC8] bg-white p-4 shadow-sm transition hover:shadow-md">
      <p className="text-sm text-gray-500">{title}</p>
      <p className={`text-3xl font-semibold ${colorClass}`}>{value}</p>
      {delta != null && delta !== '' && (
        <p className="mt-1 text-xs text-gray-500">{delta}</p>
      )}
      {showPctBar && pct != null && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${Math.min(100, Math.max(0, pct))}%`,
              backgroundColor: GOLD,
            }}
          />
        </div>
      )}
    </div>
  );
}

export function ExecutiveDashboardClient() {
  const [data, setData] = useState<ExecutiveData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/executive')
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load');
        return r.json();
      })
      .then(setData)
      .catch(() => setError('Failed to load executive data'))
      .finally(() => setLoading(false));
  }, []);

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-[#E8DFC8] bg-white p-6 shadow-sm">
          <p className="text-slate-600">{error}</p>
        </div>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-6">
        <p className="text-gray-500">Loading…</p>
      </div>
    );
  }

  const { kpis } = data;
  const achievementPct = kpis.achievementPct;
  const overduePct = kpis.overdueTasksPct;
  const balancePct = kpis.scheduleBalancePct;
  const riskPct = kpis.riskIndex;

  const weekStart = (() => {
    const d = new Date();
    const day = d.getUTCDay();
    const diff = (day - 6 + 7) % 7;
    const sat = new Date(d);
    sat.setUTCDate(sat.getUTCDate() - diff);
    return sat.toISOString().slice(0, 10);
  })();

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-gray-800">Executive Dashboard</h1>
        <div className="flex flex-wrap items-center gap-3">
          <a
            href={`/api/executive/weekly-pdf?weekStart=${weekStart}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-[#E8DFC8] bg-white px-3 py-1.5 text-sm text-gray-700 shadow-sm hover:bg-[#F8F4E8]"
          >
            Download Weekly PDF
          </a>
          <a
            href="/executive/monthly"
            className="rounded-lg border border-[#E8DFC8] bg-white px-3 py-1.5 text-sm text-gray-700 shadow-sm hover:bg-[#F8F4E8]"
          >
            Executive Monthly
          </a>
        </div>
      </div>

      {data.boutiqueScore != null && (
        <div className="rounded-2xl border-2 border-[#E8DFC8] bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">Boutique Performance Score</p>
          <p className="text-2xl font-semibold text-[#C6A756]">
            {data.boutiqueScore.score}
            <span className="ml-2 text-base font-normal text-gray-600">
              ({data.boutiqueScore.classification})
            </span>
          </p>
        </div>
      )}

      {/* Section 1 – KPI Cards */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KPICard
          title="Revenue (Current Month)"
          value={kpis.revenue.toLocaleString()}
          delta={kpis.revenueDelta != null ? `vs prev: ${kpis.revenueDelta > 0 ? '+' : ''}${kpis.revenueDelta}%` : undefined}
        />
        <KPICard
          title="Target (Current Month)"
          value={kpis.target.toLocaleString()}
          delta={kpis.targetDelta != null ? `vs prev: ${kpis.targetDelta > 0 ? '+' : ''}${kpis.targetDelta}%` : undefined}
        />
        <KPICard
          title="Achievement %"
          value={`${achievementPct}%`}
          delta={undefined}
          pct={achievementPct}
          showPctBar
        />
        <KPICard
          title="Overdue Tasks %"
          value={`${overduePct}%`}
          pct={100 - Math.min(100, overduePct)}
          showPctBar
        />
        <KPICard
          title="Schedule Balance %"
          value={`${balancePct}%`}
          pct={balancePct}
          showPctBar
        />
        <KPICard
          title="Risk Index"
          value={riskPct}
          pct={100 - Math.min(100, riskPct)}
          showPctBar
        />
      </section>

      {/* Section 2 – Performance Analytics */}
      <section className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-[#E8DFC8] bg-white p-4 shadow-sm transition hover:shadow-md">
          <h2 className="mb-3 text-sm font-medium text-gray-500">Sales vs Target trend</h2>
          <ExecutiveLineChart
            height={200}
            data={data.salesVsTargetTrend.map((d) => ({ label: d.label, value: d.sales }))}
            targetLine={data.salesVsTargetTrend.map((d) => d.target)}
            valueFormat={(n) => (n / 1000).toFixed(0) + 'k'}
          />
        </div>
        <div className="rounded-2xl border border-[#E8DFC8] bg-white p-4 shadow-sm transition hover:shadow-md">
          <h2 className="mb-3 text-sm font-medium text-gray-500">Task completion breakdown</h2>
          <ExecutiveBarChart
            height={200}
            data={data.taskCompletionBreakdown}
            valueFormat={(n) => String(n)}
          />
        </div>
        <div className="rounded-2xl border border-[#E8DFC8] bg-white p-4 shadow-sm transition hover:shadow-md">
          <h2 className="mb-3 text-sm font-medium text-gray-500">Zone compliance rate (A–G)</h2>
          <ExecutiveBarChart
            height={200}
            data={data.zoneCompliance.map((z) => ({ label: z.zone, value: z.rate }))}
            valueFormat={(n) => `${n}%`}
          />
        </div>
      </section>

      {/* Section 3 – Executive Control */}
      <section className="grid gap-6 lg:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-[#E8DFC8] bg-white p-4 shadow-sm transition hover:shadow-md">
          <h2 className="mb-3 text-sm font-medium text-gray-500">Anti-Gaming summary</h2>
          <div className="space-y-1 text-sm">
            <p>Burst flags: <span className="font-semibold text-[#C6A756]">{data.antiGamingSummary.burstCount}</span></p>
            <p>Same-day bulk: <span className="font-semibold">{data.antiGamingSummary.sameDayBulkCount}</span></p>
            {data.antiGamingSummary.topSuspicious.length > 0 && (
              <p className="mt-2 text-xs text-gray-500">Top: {data.antiGamingSummary.topSuspicious.join(', ')}</p>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-[#E8DFC8] bg-white p-4 shadow-sm transition hover:shadow-md">
          <h2 className="mb-3 text-sm font-medium text-gray-500">Latest schedule edits</h2>
          <ul className="max-h-48 space-y-1 overflow-y-auto text-xs">
            {data.latestScheduleEdits.length === 0 ? (
              <li className="text-gray-500">—</li>
            ) : (
              data.latestScheduleEdits.map((e) => (
                <li key={e.id} className="flex flex-wrap gap-x-2">
                  <span className="font-medium">{e.editorName}</span>
                  <span className="text-gray-500">{e.weekStart}</span>
                  <span className="text-gray-400">{new Date(e.editedAt).toLocaleString()}</span>
                </li>
              ))
            )}
          </ul>
        </div>

        <div className="rounded-2xl border border-[#E8DFC8] bg-white p-4 shadow-sm transition hover:shadow-md">
          <h2 className="mb-3 text-sm font-medium text-gray-500">Top performer (this week)</h2>
          {data.topPerformer ? (
            <>
              <p className="text-2xl font-semibold text-[#C6A756]">{data.topPerformer.name}</p>
              <p className="text-sm text-gray-500">{data.topPerformer.completedCount} tasks completed</p>
            </>
          ) : (
            <p className="text-sm text-gray-500">—</p>
          )}
        </div>

        {data.showRiskPanel && (
          <div className="rounded-2xl border-2 border-amber-300 bg-amber-50/80 p-4 shadow-sm">
            <h2 className="mb-2 text-sm font-medium text-amber-800">Risk panel</h2>
            <p className="text-sm text-amber-900">
              Overdue &gt; 10% or suspicious &gt; 5% or achievement &lt; 80%. Review task completion and sales targets.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
