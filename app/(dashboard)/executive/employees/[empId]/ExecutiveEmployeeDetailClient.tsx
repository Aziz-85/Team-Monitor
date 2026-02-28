'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/app/providers';
import { OpsCard } from '@/components/ui/OpsCard';
import { AdminDataTable, AdminTableHead, AdminTh, AdminTableBody, AdminTd } from '@/components/admin/AdminDataTable';

function getNested(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((o: unknown, k) => (o as Record<string, unknown>)?.[k], obj);
}

type DetailData = {
  year: string;
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

export function ExecutiveEmployeeDetailClient({ empId }: { empId: string }) {
  const { messages } = useI18n();
  const t = useCallback((key: string) => (getNested(messages, key) as string) || key, [messages]);

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

  if (loading) return <div className="p-4 text-sm text-slate-500">{t('common.loading')}</div>;
  if (!data) return <div className="p-4 text-sm text-amber-700">{t('executive.employees.error')}</div>;

  const monthLabels = data.monthlySeries.map((_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);

  return (
    <div className="min-w-0 p-4 md:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Link href={`/executive/employees${viewMode === 'global' ? '?global=true' : ''}`} className="text-sky-600 hover:underline text-sm">‹ {t('executive.employees.back')}</Link>
          <h1 className="text-xl font-semibold text-slate-900 truncate min-w-0">{data.name}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          {(role === 'ADMIN' || role === 'SUPER_ADMIN') && (
            <div className="flex rounded-lg border border-slate-300 bg-slate-50 p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('scope')}
                className={`rounded-md px-2.5 py-1 text-sm ${viewMode === 'scope' ? 'bg-white text-slate-900 shadow' : 'text-slate-600 hover:text-slate-900'}`}
              >
                {t('executive.viewScope')}
              </button>
              <button
                type="button"
                onClick={() => setViewMode('global')}
                className={`rounded-md px-2.5 py-1 text-sm ${viewMode === 'global' ? 'bg-white text-slate-900 shadow' : 'text-slate-600 hover:text-slate-900'}`}
              >
                {t('executive.viewGlobal')}
              </button>
            </div>
          )}
          <select
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900"
          >
            {[0, 1, 2, 3].map((i) => {
              const y = new Date().getFullYear() - i;
              return <option key={y} value={String(y)}>{y}</option>;
            })}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 mb-6">
        <OpsCard title={t('executive.employees.annualTotal')}>
          <p className="text-2xl font-semibold text-slate-900 tabular-nums">{formatSar(data.annualTotal)} SAR</p>
        </OpsCard>
        <OpsCard title={t('executive.compare.achPct')}>
          <p className="text-2xl font-semibold text-slate-900 tabular-nums">{data.achievementPct != null ? `${data.achievementPct}%` : '—'}</p>
        </OpsCard>
        <OpsCard title={t('executive.employees.consistency')}>
          <p className="text-2xl font-semibold text-slate-900 tabular-nums">{data.consistencyScore}</p>
        </OpsCard>
      </div>

      <OpsCard title={t('executive.employees.byBoutique')} className="mb-6">
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

      <OpsCard title={t('executive.employees.monthlySeries')} className="mb-6">
        <div className="overflow-x-hidden min-w-0">
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-700">
                {monthLabels.map((m) => (
                  <th key={m} className="py-2 px-1 text-center truncate">{m.slice(5)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {data.monthlySeries.map((amt, i) => (
                  <td key={i} className="py-2 px-1 text-center tabular-nums">{formatSar(amt)}</td>
                ))}
              </tr>
            </tbody>
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

      <OpsCard title={t('kpi.appraisalTab')} className="mt-6">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <label className="text-sm font-medium text-slate-700">{t('kpi.periodKey')}:</label>
          <input
            type="text"
            value={kpiPeriod}
            onChange={(e) => setKpiPeriod(e.target.value)}
            placeholder="YYYY or YYYY-MM"
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 w-28"
          />
        </div>
        {kpiLoading && <p className="text-sm text-slate-500">{t('common.loading')}</p>}
        {!kpiLoading && !kpiSnapshot && <p className="text-sm text-slate-500">{t('kpi.noSnapshot')}</p>}
        {!kpiLoading && kpiSnapshot && (
          <div className="space-y-3 text-sm overflow-x-hidden">
            <div className="grid grid-cols-2 gap-2 max-w-md">
              <div><span className="text-slate-600">{t('kpi.overall')}:</span> <span className="font-medium tabular-nums">{kpiSnapshot.overallOutOf5}/5</span></div>
              <div><span className="text-slate-600">{t('kpi.salesKpi')}:</span> <span className="tabular-nums">{kpiSnapshot.salesKpiOutOf5}/5</span></div>
              <div><span className="text-slate-600">{t('kpi.skills')}:</span> <span className="tabular-nums">{kpiSnapshot.skillsOutOf5}/5</span></div>
              <div><span className="text-slate-600">{t('kpi.company')}:</span> <span className="tabular-nums">{kpiSnapshot.companyOutOf5}/5</span></div>
            </div>
            {Array.isArray(kpiSnapshot.sectionsJson) && kpiSnapshot.sectionsJson.length > 0 && (
              <ul className="list-disc list-inside text-slate-700">
                {(kpiSnapshot.sectionsJson as { name: string; totalScore: number }[]).map((s: { name: string; totalScore: number }, i: number) => (
                  <li key={i}>{s.name}: {s.totalScore}/5</li>
                ))}
              </ul>
            )}
            {kpiSnapshot.fileName && <p className="text-xs text-slate-500">{t('kpi.source')}: {kpiSnapshot.fileName}</p>}
          </div>
        )}
      </OpsCard>
    </div>
  );
}
