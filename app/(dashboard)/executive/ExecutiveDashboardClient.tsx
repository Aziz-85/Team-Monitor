'use client';

import { useEffect, useState } from 'react';
import { useT } from '@/lib/i18n/useT';
import { formatSarInt } from '@/lib/utils/money';
import { ExecutiveLineChart } from '@/components/executive/ExecutiveLineChart';
import { ExecutiveBarChart } from '@/components/executive/ExecutiveBarChart';
import {
  EXECUTIVE_CARD_BORDER,
  EXECUTIVE_CARD_BG,
  EXECUTIVE_GOLD,
  EXECUTIVE_HOVER_BG,
} from '@/lib/chartStyles';
import { ExecutiveKpiCard } from '@/components/dashboard-ui/ExecutiveKpiCard';

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

export function ExecutiveDashboardClient() {
  const { t } = useT();
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
      .catch(() => setError(t('executive.failedToLoad')))
      .finally(() => setLoading(false));
  }, [t]);

  if (error) {
    return (
      <div className="p-6">
        <div
          className="rounded-2xl border p-6 shadow-sm"
          style={{ borderColor: EXECUTIVE_CARD_BORDER, backgroundColor: EXECUTIVE_CARD_BG }}
        >
          <p className="text-muted">{error}</p>
        </div>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-6">
        <p className="text-muted">{t('common.loading')}</p>
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
        <h1 className="text-xl font-semibold text-foreground">{t('executive.title')}</h1>
        <div className="flex flex-wrap items-center gap-3">
          <a
            href={`/api/executive/weekly-pdf?weekStart=${weekStart}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border px-3 py-1.5 text-sm text-foreground shadow-sm transition-colors"
            style={{ borderColor: EXECUTIVE_CARD_BORDER, backgroundColor: EXECUTIVE_CARD_BG }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = EXECUTIVE_HOVER_BG; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = EXECUTIVE_CARD_BG; }}
          >
            Download Weekly PDF
          </a>
          <a
            href="/executive/monthly"
            className="rounded-lg border px-3 py-1.5 text-sm text-foreground shadow-sm transition-colors"
            style={{ borderColor: EXECUTIVE_CARD_BORDER, backgroundColor: EXECUTIVE_CARD_BG }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = EXECUTIVE_HOVER_BG; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = EXECUTIVE_CARD_BG; }}
          >
            Executive Monthly
          </a>
        </div>
      </div>

      {data.boutiqueScore != null && (
        <div
          className="rounded-2xl border-2 p-4 shadow-sm"
          style={{ borderColor: EXECUTIVE_CARD_BORDER, backgroundColor: EXECUTIVE_CARD_BG }}
        >
          <p className="text-sm text-muted">Boutique Performance Score</p>
          <p className="text-2xl font-semibold" style={{ color: EXECUTIVE_GOLD }}>
            {data.boutiqueScore.score}
            <span className="ms-2 text-base font-normal text-muted">
              ({data.boutiqueScore.classification})
            </span>
          </p>
        </div>
      )}

      {/* Section 1 – KPI Cards */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <ExecutiveKpiCard
          title="Revenue (Current Month)"
          value={kpis.revenue.toLocaleString()}
          delta={kpis.revenueDelta != null ? `vs prev: ${kpis.revenueDelta > 0 ? '+' : ''}${kpis.revenueDelta}%` : undefined}
        />
        <ExecutiveKpiCard
          title="Target (Current Month)"
          value={kpis.target.toLocaleString()}
          delta={kpis.targetDelta != null ? `vs prev: ${kpis.targetDelta > 0 ? '+' : ''}${kpis.targetDelta}%` : undefined}
        />
        <ExecutiveKpiCard
          title="Achievement %"
          value={`${achievementPct}%`}
          delta={undefined}
          pct={achievementPct}
          showPctBar
        />
        <ExecutiveKpiCard
          title="Overdue Tasks %"
          value={`${overduePct}%`}
          pct={100 - Math.min(100, overduePct)}
          showPctBar
        />
        <ExecutiveKpiCard
          title="Schedule Balance %"
          value={`${balancePct}%`}
          pct={balancePct}
          showPctBar
        />
        <ExecutiveKpiCard
          title={t('executive.riskIndex')}
          value={riskPct}
          pct={100 - Math.min(100, riskPct)}
          showPctBar
        />
      </section>

      {/* Section 2 – Performance Analytics */}
      <section className="grid gap-6 lg:grid-cols-3">
        <div
          className="rounded-2xl border p-4 shadow-sm transition hover:shadow-md"
          style={{ borderColor: EXECUTIVE_CARD_BORDER, backgroundColor: EXECUTIVE_CARD_BG }}
        >
          <h2 className="mb-3 text-sm font-medium text-muted">{t('executive.salesVsTarget')}</h2>
          <ExecutiveLineChart
            height={200}
            data={data.salesVsTargetTrend.map((d) => ({ label: d.label, value: d.sales }))}
            targetLine={data.salesVsTargetTrend.map((d) => d.target)}
            valueFormat={(n) => formatSarInt(n)}
          />
        </div>
        <div
          className="rounded-2xl border p-4 shadow-sm transition hover:shadow-md"
          style={{ borderColor: EXECUTIVE_CARD_BORDER, backgroundColor: EXECUTIVE_CARD_BG }}
        >
          <h2 className="mb-3 text-sm font-medium text-muted">{t('executive.taskCompletion')}</h2>
          <ExecutiveBarChart
            height={200}
            data={data.taskCompletionBreakdown}
            valueFormat={(n) => String(n)}
          />
        </div>
        <div
          className="rounded-2xl border p-4 shadow-sm transition hover:shadow-md"
          style={{ borderColor: EXECUTIVE_CARD_BORDER, backgroundColor: EXECUTIVE_CARD_BG }}
        >
          <h2 className="mb-3 text-sm font-medium text-muted">{t('executive.zoneCompliance')}</h2>
          <ExecutiveBarChart
            height={200}
            data={data.zoneCompliance.map((z) => ({ label: z.zone, value: z.rate }))}
            valueFormat={(n) => `${n}%`}
          />
        </div>
      </section>

      {/* Section 3 – Executive Control */}
      <section className="grid gap-6 lg:grid-cols-2 xl:grid-cols-4">
        <div
          className="rounded-2xl border p-4 shadow-sm transition hover:shadow-md"
          style={{ borderColor: EXECUTIVE_CARD_BORDER, backgroundColor: EXECUTIVE_CARD_BG }}
        >
          <h2 className="mb-3 text-sm font-medium text-muted">{t('executive.antiGaming')}</h2>
          <div className="space-y-1 text-sm">
            <p>Burst flags: <span className="font-semibold" style={{ color: EXECUTIVE_GOLD }}>{data.antiGamingSummary.burstCount}</span></p>
            <p>Same-day bulk: <span className="font-semibold">{data.antiGamingSummary.sameDayBulkCount}</span></p>
            {data.antiGamingSummary.topSuspicious.length > 0 && (
              <p className="mt-2 text-xs text-muted">Top: {data.antiGamingSummary.topSuspicious.join(', ')}</p>
            )}
          </div>
        </div>

        <div
          className="rounded-2xl border p-4 shadow-sm transition hover:shadow-md"
          style={{ borderColor: EXECUTIVE_CARD_BORDER, backgroundColor: EXECUTIVE_CARD_BG }}
        >
          <h2 className="mb-3 text-sm font-medium text-muted">{t('executive.scheduleEdits')}</h2>
          <ul className="max-h-48 space-y-1 overflow-y-auto text-xs">
            {data.latestScheduleEdits.length === 0 ? (
              <li className="text-muted">—</li>
            ) : (
              data.latestScheduleEdits.map((e) => (
                <li key={e.id} className="flex flex-wrap gap-x-2">
                  <span className="font-medium">{e.editorName}</span>
                  <span className="text-muted">{e.weekStart}</span>
                  <span className="text-muted">{new Date(e.editedAt).toLocaleString()}</span>
                </li>
              ))
            )}
          </ul>
        </div>

        <div
          className="rounded-2xl border p-4 shadow-sm transition hover:shadow-md"
          style={{ borderColor: EXECUTIVE_CARD_BORDER, backgroundColor: EXECUTIVE_CARD_BG }}
        >
          <h2 className="mb-3 text-sm font-medium text-muted">{t('executive.topPerformer')}</h2>
          {data.topPerformer ? (
            <>
              <p className="text-2xl font-semibold" style={{ color: EXECUTIVE_GOLD }}>{data.topPerformer.name}</p>
              <p className="text-sm text-muted">{data.topPerformer.completedCount} tasks completed</p>
            </>
          ) : (
            <p className="text-sm text-muted">—</p>
          )}
        </div>

        {data.showRiskPanel && (
          <div className="rounded-2xl border-2 border-amber-300 bg-amber-50/80 p-4 shadow-sm">
            <h2 className="mb-2 text-sm font-medium text-amber-800">{t('executive.riskPanel')}</h2>
            <p className="text-sm text-amber-900">
              Overdue &gt; 10% or suspicious &gt; 5% or achievement &lt; 80%. Review task completion and sales targets.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
