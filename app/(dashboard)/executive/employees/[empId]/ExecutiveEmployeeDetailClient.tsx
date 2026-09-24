'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useT } from '@/lib/i18n/useT';
import { OpsCard } from '@/components/ui/OpsCard';
import { PaceCard } from '@/components/analytics/PaceCard';
import { ForecastCard } from '@/components/analytics/ForecastCard';
import type { ForecastMetrics, PaceMetrics } from '@/lib/analytics/performanceLayer';
import { AdminDataTable, AdminTableHead, AdminTh, AdminTableBody, AdminTd } from '@/components/admin/AdminDataTable';
import { ExecutiveLineChart } from '@/components/executive/ExecutiveLineChart';

type DetailData = {
  year: string;
  empId: string;
  name: string;
  annualTotal: number;
  byBoutique: { boutiqueId: string; boutiqueCode: string; boutiqueName: string; total: number }[];
  monthlySeries: number[];
  monthlyPerformance: Array<{
    month: string;
    sales: number;
    target: number;
    achievementPct: number | null;
    invoices: number;
    pieces: number;
    avt: number | null;
    avp: number | null;
    upt: number | null;
  }>;
  consistencyScore: number;
  topMonths: { month: string; amount: number }[];
  bottomMonths: { month: string; amount: number }[];
  achievementPct: number | null;
};

function formatSar(n: number) {
  return new Intl.NumberFormat('en-SA', { maximumFractionDigits: 0 }).format(n);
}

export function ExecutiveEmployeeDetailClient({ empId }: { empId: string }) {
  const { t } = useT();

  const [role, setRole] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'scope' | 'global'>(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search);
      return p.get('global') === 'true' ? 'global' : 'scope';
    }
    return 'scope';
  });
  const [year, setYear] = useState(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search);
      return p.get('year') || String(new Date().getFullYear());
    }
    return String(new Date().getFullYear());
  });
  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [kpiPeriod, setKpiPeriod] = useState(() => String(new Date().getFullYear()));
  const [kpiSnapshot, setKpiSnapshot] = useState<{
    overallOutOf5: number;
    salesKpiOutOf5: number;
    skillsOutOf5: number;
    companyOutOf5: number;
    sectionsJson?: unknown;
    fileName?: string;
    createdAt?: string;
  } | null>(null);
  const [kpiLoading, setKpiLoading] = useState(false);
  const [mtdAnalytics, setMtdAnalytics] = useState<{
    employees?: Array<{ pace: PaceMetrics; forecast: ForecastMetrics }>;
  } | null>(null);

  useEffect(() => {
    fetch('/api/me/scope')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.role && setRole(d.role))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const global = (role === 'ADMIN' || role === 'SUPER_ADMIN') && viewMode === 'global' ? '&global=true' : '';
    fetch(`/api/executive/employees/${encodeURIComponent(empId)}?year=${encodeURIComponent(year)}${global}`)
      .then((r) => {
        if (!r.ok) throw new Error('Failed');
        return r.json();
      })
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [empId, year, viewMode, role]);

  useEffect(() => {
    if (!empId || !kpiPeriod.trim()) return;
    setKpiLoading(true);
    fetch(`/api/kpi/employee?empId=${encodeURIComponent(empId)}&periodKey=${encodeURIComponent(kpiPeriod.trim())}`)
      .then((r) => r.ok ? r.json() : { snapshot: null })
      .then((d) => setKpiSnapshot(d.snapshot ? {
        overallOutOf5: d.snapshot.overallOutOf5,
        salesKpiOutOf5: d.snapshot.salesKpiOutOf5,
        skillsOutOf5: d.snapshot.skillsOutOf5,
        companyOutOf5: d.snapshot.companyOutOf5,
        sectionsJson: d.snapshot.sectionsJson,
        fileName: d.snapshot.fileName,
        createdAt: d.snapshot.createdAt,
      } : null))
      .catch(() => setKpiSnapshot(null))
      .finally(() => setKpiLoading(false));
  }, [empId, kpiPeriod]);

  useEffect(() => {
    if (!empId.trim() || role == null) return;
    const global =
      (role === 'ADMIN' || role === 'SUPER_ADMIN') && viewMode === 'global'
        ? '&global=true'
        : '';
    fetch(`/api/analytics/performance?empId=${encodeURIComponent(empId)}${global}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setMtdAnalytics)
      .catch(() => setMtdAnalytics(null));
  }, [empId, viewMode, role]);

  if (loading) return <div className="m-4 app-card p-8 text-center text-sm text-muted">{t('common.loading')}</div>;
  if (!data) return <div className="m-4 app-card p-8 text-center text-sm text-amber-700">{t('executive.employees.error')}</div>;

  return (
    <div className="mx-auto min-w-0 max-w-screen-2xl space-y-5 p-4 md:p-6">
      <header className="relative overflow-hidden rounded-card border border-border/70 bg-surface px-5 py-5 shadow-card md:px-6">
        <span className="absolute inset-y-0 start-0 w-1 bg-accent" aria-hidden />
        <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <Link href={`/executive/employees${viewMode === 'global' ? '?global=true' : ''}`} className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline">‹ {t('executive.employees.back')}</Link>
          <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.18em] text-accent">Employee intelligence · {empId}</p>
          <h1 className="mt-1 truncate text-2xl font-bold tracking-tight text-foreground">{data.name}</h1>
          <p className="mt-1 text-sm text-muted">Annual performance, monthly trajectory and transaction quality.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          {(role === 'ADMIN' || role === 'SUPER_ADMIN') && (
            <div className="flex rounded-xl border border-border bg-surface-subtle p-1">
              <button
                type="button"
                onClick={() => setViewMode('scope')}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium ${viewMode === 'scope' ? 'bg-surface text-accent shadow-sm' : 'text-muted hover:text-foreground'}`}
              >
                {t('executive.viewScope')}
              </button>
              <button
                type="button"
                onClick={() => setViewMode('global')}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium ${viewMode === 'global' ? 'bg-surface text-accent shadow-sm' : 'text-muted hover:text-foreground'}`}
              >
                {t('executive.viewGlobal')}
              </button>
            </div>
          )}
          <select
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="h-10 rounded-xl border border-border bg-surface px-3 text-sm font-medium text-foreground shadow-sm"
          >
            {[0, 1, 2, 3].map((i) => {
              const y = new Date().getFullYear() - i;
              return <option key={y} value={String(y)}>{y}</option>;
            })}
          </select>
        </div>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <article className="app-card relative overflow-hidden p-5"><span className="absolute inset-x-0 top-0 h-0.5 bg-accent" /><p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted">{t('executive.employees.annualTotal')}</p><p className="mt-2 text-2xl font-bold tracking-tight text-foreground tabular-nums">{formatSar(data.annualTotal)} <span className="text-sm font-medium text-muted">SAR</span></p></article>
        <article className="app-card relative overflow-hidden p-5"><span className="absolute inset-x-0 top-0 h-0.5 bg-border" /><p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted">{t('executive.compare.achPct')}</p><p className={`mt-2 text-2xl font-bold tracking-tight tabular-nums ${data.achievementPct != null && data.achievementPct >= 100 ? 'text-emerald-700' : 'text-foreground'}`}>{data.achievementPct != null ? `${data.achievementPct}%` : '—'}</p></article>
        <article className="app-card relative overflow-hidden p-5"><span className="absolute inset-x-0 top-0 h-0.5 bg-border" /><p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted">{t('executive.employees.consistency')}</p><p className="mt-2 text-2xl font-bold tracking-tight text-foreground tabular-nums">{data.consistencyScore}</p></article>
      </section>

      {mtdAnalytics?.employees?.[0] && (
        <div className="grid gap-4 md:grid-cols-2">
          <PaceCard
            title={t('analytics.monthPaceTitle')}
            pace={mtdAnalytics.employees[0].pace}
            expectedLabel={t('analytics.expectedByToday')}
            actualMtdLabel={t('analytics.actualMtdPace')}
            deltaLabel={t('analytics.deltaVsExpected')}
            bandLabels={{
              ahead: t('analytics.ahead'),
              onTrack: t('analytics.onTrack'),
              behind: t('analytics.behind'),
            }}
          />
          <ForecastCard
            title={t('analytics.monthForecastTitle')}
            linear={mtdAnalytics.employees[0].forecast}
            rolling7={null}
            disclaimer={t('analytics.projectionOnly')}
            rollingTitle={t('analytics.forecastRolling7')}
          />
        </div>
      )}

      <OpsCard title={t('executive.employees.byBoutique')}>
        <AdminDataTable>
          <AdminTableHead>
            <AdminTh>{t('executive.compare.boutique')}</AdminTh>
            <AdminTh>{t('executive.employees.total')}</AdminTh>
          </AdminTableHead>
          <AdminTableBody>
            {data.byBoutique.map((b) => (
              <tr key={b.boutiqueId}>
                <AdminTd className="truncate min-w-0" title={b.boutiqueName}>{b.boutiqueName}</AdminTd>
                <AdminTd className="tabular-nums">{formatSar(b.total)}</AdminTd>
              </tr>
            ))}
          </AdminTableBody>
        </AdminDataTable>
      </OpsCard>

      <OpsCard title={t('executive.employees.monthlySeries')}>
        <ExecutiveLineChart
          height={280}
          data={data.monthlyPerformance.map((m) => ({ label: m.month.slice(5), value: m.sales }))}
          targetLine={data.monthlyPerformance.map((m) => m.target)}
          valueFormat={(n) => `${formatSar(n)} SAR`}
        />
      </OpsCard>

      <OpsCard title="Monthly Performance Details">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-surface-subtle/70"><tr className="border-b border-border text-left text-[10px] uppercase tracking-[0.08em] text-muted"><th className="px-3 py-3">Month</th><th className="px-3 py-3 text-right">Target</th><th className="px-3 py-3 text-right">Sales</th><th className="px-3 py-3 text-right">Achievement</th><th className="px-3 py-3 text-right">Invoices</th><th className="px-3 py-3 text-right">Pieces</th><th className="px-3 py-3 text-right">AVT</th><th className="px-3 py-3 text-right">AVP</th><th className="px-3 py-3 text-right">UPT</th></tr></thead>
            <tbody>{data.monthlyPerformance.map((m) => <tr key={m.month} className="border-b border-border/60 last:border-0 hover:bg-surface-subtle/70"><td className="px-3 py-3 font-semibold">{m.month}</td><td className="px-3 py-3 text-right tabular-nums">{m.target ? formatSar(m.target) : '—'}</td><td className="px-3 py-3 text-right font-semibold tabular-nums">{m.sales ? formatSar(m.sales) : '—'}</td><td className={`px-3 py-3 text-right font-semibold tabular-nums ${m.achievementPct != null ? (m.achievementPct >= 100 ? 'text-emerald-700' : m.achievementPct >= 80 ? 'text-amber-700' : 'text-red-700') : ''}`}>{m.achievementPct == null ? '—' : `${m.achievementPct}%`}</td><td className="px-3 py-3 text-right tabular-nums">{m.invoices || '—'}</td><td className="px-3 py-3 text-right tabular-nums">{m.pieces || '—'}</td><td className="px-3 py-3 text-right tabular-nums">{m.avt == null ? '—' : formatSar(m.avt)}</td><td className="px-3 py-3 text-right tabular-nums">{m.avp == null ? '—' : formatSar(m.avp)}</td><td className="px-3 py-3 text-right tabular-nums">{m.upt == null ? '—' : m.upt.toFixed(2)}</td></tr>)}</tbody>
          </table>
        </div>
      </OpsCard>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <OpsCard title={t('executive.employees.topMonths')}>
          <ul className="space-y-2">
            {data.topMonths.map((m) => (
              <li key={m.month} className="flex justify-between text-sm">
                <span>{m.month}</span>
                <span className="tabular-nums font-medium">{formatSar(m.amount)}</span>
              </li>
            ))}
          </ul>
        </OpsCard>
        <OpsCard title={t('executive.employees.bottomMonths')}>
          <ul className="space-y-2">
            {data.bottomMonths.map((m) => (
              <li key={m.month} className="flex justify-between text-sm">
                <span>{m.month}</span>
                <span className="tabular-nums">{formatSar(m.amount)}</span>
              </li>
            ))}
          </ul>
        </OpsCard>
      </div>

      <OpsCard title={t('kpi.appraisalTab')}>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <label className="text-sm font-medium text-foreground">{t('kpi.periodKey')}:</label>
          <input
            type="text"
            value={kpiPeriod}
            onChange={(e) => setKpiPeriod(e.target.value)}
            placeholder="YYYY or YYYY-MM"
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-foreground w-28"
          />
        </div>
        {kpiLoading && <p className="text-sm text-muted">{t('common.loading')}</p>}
        {!kpiLoading && !kpiSnapshot && <p className="text-sm text-muted">{t('kpi.noSnapshot')}</p>}
        {!kpiLoading && kpiSnapshot && (
          <div className="space-y-3 text-sm overflow-x-hidden">
            <div className="grid grid-cols-2 gap-2 max-w-md">
              <div><span className="text-muted">{t('kpi.overall')}:</span> <span className="font-medium tabular-nums">{kpiSnapshot.overallOutOf5}/5</span></div>
              <div><span className="text-muted">{t('kpi.salesKpi')}:</span> <span className="tabular-nums">{kpiSnapshot.salesKpiOutOf5}/5</span></div>
              <div><span className="text-muted">{t('kpi.skills')}:</span> <span className="tabular-nums">{kpiSnapshot.skillsOutOf5}/5</span></div>
              <div><span className="text-muted">{t('kpi.company')}:</span> <span className="tabular-nums">{kpiSnapshot.companyOutOf5}/5</span></div>
            </div>
            {Array.isArray(kpiSnapshot.sectionsJson) && kpiSnapshot.sectionsJson.length > 0 && (
              <ul className="list-disc list-inside text-foreground">
                {(kpiSnapshot.sectionsJson as { name: string; totalScore: number }[]).map((s: { name: string; totalScore: number }, i: number) => (
                  <li key={i}>{s.name}: {s.totalScore}/5</li>
                ))}
              </ul>
            )}
            {kpiSnapshot.fileName && <p className="text-xs text-muted">{t('kpi.source')}: {kpiSnapshot.fileName}</p>}
          </div>
        )}
      </OpsCard>
    </div>
  );
}
