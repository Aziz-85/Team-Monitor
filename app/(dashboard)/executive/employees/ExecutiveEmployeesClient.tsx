'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useT } from '@/lib/i18n/useT';
import { OpsCard } from '@/components/ui/OpsCard';
import { AdminDataTable, AdminTableHead, AdminTh, AdminTableBody, AdminTd } from '@/components/admin/AdminDataTable';
import { ProductivityTable } from '@/components/analytics/ProductivityTable';
import type { EmployeeProductivityRollup } from '@/lib/sales-analytics/types';

type ProductivityEmployeeRow = {
  userId: string;
  name: string;
  totalSalesMTD: number;
  activeDays: number;
  avgDailySales: number;
  contributionPct: number;
  employeeProductivity?: EmployeeProductivityRollup;
};

type EmployeeRow = {
  empId: string;
  name: string;
  annualTotal: number;
  byBoutique: { boutiqueId: string; boutiqueCode: string; boutiqueName: string; total: number }[];
  monthlySeries: number[];
  consistencyScore: number;
  topMonths: { month: string; amount: number }[];
  bottomMonths: { month: string; amount: number }[];
  achievementPct: number | null;
};

function formatSar(n: number) {
  return new Intl.NumberFormat('en-SA', { maximumFractionDigits: 0 }).format(n);
}

export function ExecutiveEmployeesClient() {
  const { t } = useT();

  const [role, setRole] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'scope' | 'global'>('scope');
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [data, setData] = useState<{ year: string; employees: EmployeeRow[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [productivityLoading, setProductivityLoading] = useState(true);
  const [productivityRows, setProductivityRows] = useState<ProductivityEmployeeRow[]>([]);

  useEffect(() => {
    fetch('/api/me/scope')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.role && setRole(d.role))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const global = (role === 'ADMIN' || role === 'SUPER_ADMIN') && viewMode === 'global' ? '&global=true' : '';
    fetch(`/api/executive/employees/annual?year=${encodeURIComponent(year)}${global}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed'))))
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [year, viewMode, role]);

  useEffect(() => {
    if (role == null) return;
    setProductivityLoading(true);
    const global = (role === 'ADMIN' || role === 'SUPER_ADMIN') && viewMode === 'global' ? '&global=true' : '';
    fetch(`/api/analytics/performance?employees=true${global}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { employees?: ProductivityEmployeeRow[] } | null) => {
        setProductivityRows(Array.isArray(d?.employees) ? d!.employees! : []);
      })
      .catch(() => setProductivityRows([]))
      .finally(() => setProductivityLoading(false));
  }, [viewMode, role]);

  const list = useMemo(() => data?.employees ?? [], [data?.employees]);
  const summary = useMemo(() => {
    if (!list.length) return null;
    const ranked = [...list].sort((a, b) => b.annualTotal - a.annualTotal);
    const withAchievement = list.filter((row) => row.achievementPct != null);
    return {
      total: list.reduce((sum, row) => sum + row.annualTotal, 0),
      averageAchievement: withAchievement.length
        ? withAchievement.reduce((sum, row) => sum + (row.achievementPct ?? 0), 0) / withAchievement.length
        : null,
      averageConsistency: list.reduce((sum, row) => sum + row.consistencyScore, 0) / list.length,
      leader: ranked[0],
    };
  }, [list]);

  return (
    <div className="mx-auto min-w-0 max-w-screen-2xl space-y-5 p-4 md:p-6">
      <header className="relative overflow-hidden rounded-card border border-border/70 bg-surface px-5 py-5 shadow-card md:px-6">
        <span className="absolute inset-y-0 start-0 w-1 bg-accent" aria-hidden />
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-accent">Team intelligence</p><h1 className="mt-1 truncate text-2xl font-bold tracking-tight text-foreground">{t('executive.employees.title')}</h1><p className="mt-1 text-sm text-muted">Individual contribution, target achievement and consistency across the selected year.</p></div>
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
            className="h-10 min-w-0 rounded-xl border border-border bg-surface px-3 text-sm font-medium text-foreground shadow-sm"
          >
            {[0, 1, 2, 3].map((i) => {
              const y = new Date().getFullYear() - i;
              return <option key={y} value={String(y)}>{y}</option>;
            })}
          </select>
        </div>
        </div>
      </header>

      {loading && <div className="app-card p-8 text-center text-sm text-muted">{t('common.loading')}</div>}

      {!loading && summary && (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <article className="app-card relative overflow-hidden p-5"><span className="absolute inset-x-0 top-0 h-0.5 bg-accent" /><p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted">Team annual sales</p><p className="mt-2 text-2xl font-bold tracking-tight tabular-nums">{formatSar(summary.total)}</p><p className="mt-1 text-xs text-muted">Across {list.length} employees</p></article>
          <article className="app-card relative overflow-hidden p-5"><span className="absolute inset-x-0 top-0 h-0.5 bg-border" /><p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted">Average achievement</p><p className="mt-2 text-2xl font-bold tracking-tight tabular-nums">{summary.averageAchievement != null ? `${summary.averageAchievement.toFixed(1)}%` : '—'}</p><p className="mt-1 text-xs text-muted">Employees with assigned targets</p></article>
          <article className="app-card relative overflow-hidden p-5"><span className="absolute inset-x-0 top-0 h-0.5 bg-border" /><p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted">Sales leader</p><p className="mt-2 truncate text-lg font-bold tracking-tight" title={summary.leader.name}>{summary.leader.name}</p><p className="mt-1 text-xs font-medium text-accent">{formatSar(summary.leader.annualTotal)} SAR</p></article>
          <article className="app-card relative overflow-hidden p-5"><span className="absolute inset-x-0 top-0 h-0.5 bg-border" /><p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted">Average consistency</p><p className="mt-2 text-2xl font-bold tracking-tight tabular-nums">{summary.averageConsistency.toFixed(1)}</p><p className="mt-1 text-xs text-muted">Stability across monthly performance</p></article>
        </section>
      )}

      <div>
        <ProductivityTable
          title={t('analytics.productivityTitle')}
          subtitle={t('analytics.productivitySubtitle')}
          loading={productivityLoading}
          labels={{
            employee: t('analytics.employee'),
            totalMtd: t('analytics.totalMtd'),
            activeDays: t('analytics.activeDays'),
            avgDaily: t('analytics.avgDaily'),
            contribution: t('analytics.contribution'),
            productivityInvoices: t('analytics.productivityInvoices'),
            productivityPieces: t('analytics.productivityPieces'),
            productivityAvgTicket: t('analytics.productivityAvgTicket'),
            productivityUpt: t('analytics.productivityUpt'),
          }}
          rows={productivityRows.map((e) => ({
            id: e.userId,
            name: e.name,
            totalSalesMTD: e.totalSalesMTD,
            activeDays: e.activeDays,
            avgDailySales: e.avgDailySales,
            contributionPct: e.contributionPct,
            employeeProductivity: e.employeeProductivity,
          }))}
        />
      </div>

      {!loading && data && (
        <OpsCard title={t('executive.employees.annualTotals')}>
          <AdminDataTable>
            <AdminTableHead>
              <AdminTh className="w-[15%]">{t('executive.employees.employee')}</AdminTh>
              <AdminTh className="w-[12%]">{t('executive.employees.annualTotal')}</AdminTh>
              <AdminTh className="w-[10%]">{t('executive.compare.achPct')}</AdminTh>
              <AdminTh className="w-[10%]">{t('executive.employees.consistency')}</AdminTh>
              <AdminTh className="w-[15%]">{t('executive.employees.byBoutique')}</AdminTh>
              <AdminTh className="w-[10%]">{t('common.edit')}</AdminTh>
            </AdminTableHead>
            <AdminTableBody>
              {list.map((row, index) => (
                <tr key={row.empId} className="transition-colors hover:bg-surface-subtle/70">
                  <AdminTd className="truncate min-w-0 font-medium" title={row.name}><span className="me-2 inline-grid h-6 w-6 place-items-center rounded-lg bg-surface-subtle text-[10px] font-bold text-muted">{index + 1}</span>{row.name}</AdminTd>
                  <AdminTd className="tabular-nums">{formatSar(row.annualTotal)}</AdminTd>
                  <AdminTd className={`tabular-nums ${row.achievementPct != null && row.achievementPct < 20 ? 'text-amber-700' : 'text-foreground'}`}>{row.achievementPct != null ? `${row.achievementPct}%` : '—'}</AdminTd>
                  <AdminTd className="tabular-nums">{row.consistencyScore}</AdminTd>
                  <AdminTd className="truncate min-w-0" title={row.byBoutique.map((b) => `${b.boutiqueName}: ${formatSar(b.total)}`).join(', ')}>
                    {row.byBoutique.length} {t('executive.employees.boutiques')}
                  </AdminTd>
                  <AdminTd>
                    <Link href={`/executive/employees/${encodeURIComponent(row.empId)}?year=${year}${viewMode === 'global' ? '&global=true' : ''}`} className="inline-flex rounded-lg bg-accent-soft px-2.5 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent hover:text-white">
                      {t('executive.employees.detail')}
                    </Link>
                  </AdminTd>
                </tr>
              ))}
            </AdminTableBody>
          </AdminDataTable>
        </OpsCard>
      )}
    </div>
  );
}
