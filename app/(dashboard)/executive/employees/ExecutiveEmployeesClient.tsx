'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/app/providers';
import { OpsCard } from '@/components/ui/OpsCard';
import { AdminDataTable, AdminTableHead, AdminTh, AdminTableBody, AdminTd } from '@/components/admin/AdminDataTable';

function getNested(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((o: unknown, k) => (o as Record<string, unknown>)?.[k], obj);
}

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
  const { messages } = useI18n();
  const t = useCallback((key: string) => (getNested(messages, key) as string) || key, [messages]);

  const [role, setRole] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'scope' | 'global'>('scope');
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [data, setData] = useState<{ year: string; employees: EmployeeRow[] } | null>(null);
  const [loading, setLoading] = useState(true);

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

  const list = data?.employees ?? [];

  return (
    <div className="min-w-0 p-4 md:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-slate-900 truncate min-w-0">{t('executive.employees.title')}</h1>
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
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 min-w-0"
          >
            {[0, 1, 2, 3].map((i) => {
              const y = new Date().getFullYear() - i;
              return <option key={y} value={String(y)}>{y}</option>;
            })}
          </select>
        </div>
      </div>

      {loading && <p className="text-sm text-slate-500">{t('common.loading')}</p>}
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
              {list.map((row) => (
                <tr key={row.empId}>
                  <AdminTd className="truncate min-w-0" title={row.name}>{row.name}</AdminTd>
                  <AdminTd className="tabular-nums">{formatSar(row.annualTotal)}</AdminTd>
                  <AdminTd className={`tabular-nums ${row.achievementPct != null && row.achievementPct < 20 ? 'text-amber-700' : 'text-slate-900'}`}>{row.achievementPct != null ? `${row.achievementPct}%` : '—'}</AdminTd>
                  <AdminTd className="tabular-nums">{row.consistencyScore}</AdminTd>
                  <AdminTd className="truncate min-w-0" title={row.byBoutique.map((b) => `${b.boutiqueName}: ${formatSar(b.total)}`).join(', ')}>
                    {row.byBoutique.length} {t('executive.employees.boutiques')}
                  </AdminTd>
                  <AdminTd>
                    <Link href={`/executive/employees/${encodeURIComponent(row.empId)}?year=${year}${viewMode === 'global' ? '&global=true' : ''}`} className="text-sky-600 hover:underline text-sm truncate block min-w-0">
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
