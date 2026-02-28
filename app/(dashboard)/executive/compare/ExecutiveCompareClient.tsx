'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/app/providers';
import { OpsCard } from '@/components/ui/OpsCard';
import { AdminDataTable, AdminTableHead, AdminTh, AdminTableBody, AdminTd } from '@/components/admin/AdminDataTable';

function getNested(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((o: unknown, k) => (o as Record<string, unknown>)?.[k], obj);
}

type BoutiqueRow = {
  boutiqueId: string;
  code: string;
  name: string;
  regionCode: string | null;
  regionName: string | null;
  sales: number;
  target: number;
  achievementPct: number | null;
  overduePct: number;
  riskScore: number;
};

type RegionRollup = {
  regionId: string | null;
  regionCode: string | null;
  regionName: string | null;
  boutiqueIds: string[];
  sales: number;
  target: number;
  achievementPct: number | null;
};

type GroupRollup = {
  groupId: string;
  groupCode: string;
  groupName: string;
  boutiqueIds: string[];
  sales: number;
  target: number;
  achievementPct: number | null;
};

type CompareData = {
  month: string;
  boutiques: BoutiqueRow[];
  regions: RegionRollup[];
  groups: GroupRollup[];
};

function formatSar(n: number) {
  return new Intl.NumberFormat('en-SA', { maximumFractionDigits: 0 }).format(n);
}

export function ExecutiveCompareClient() {
  const { messages } = useI18n();
  const t = useCallback((key: string) => (getNested(messages, key) as string) || key, [messages]);

  const [role, setRole] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'scope' | 'global'>('scope');
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [data, setData] = useState<CompareData | null>(null);
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
    fetch(`/api/executive/compare?month=${encodeURIComponent(month)}${global}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed'))))
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [month, viewMode, role]);

  const prevMonth = () => {
    const [y, m] = month.split('-').map(Number);
    if (m === 1) setMonth(`${y - 1}-12`);
    else setMonth(`${y}-${String(m - 1).padStart(2, '0')}`);
  };

  const nextMonth = () => {
    const [y, m] = month.split('-').map(Number);
    if (m === 12) setMonth(`${y + 1}-01`);
    else setMonth(`${y}-${String(m + 1).padStart(2, '0')}`);
  };

  const sorted = data?.boutiques ?? [];
  const byAch = [...sorted].filter((b) => b.achievementPct != null).sort((a, b) => (b.achievementPct ?? 0) - (a.achievementPct ?? 0));
  const top3 = byAch.slice(0, 3);
  const bottom3 = byAch.slice(-3).reverse();

  return (
    <div className="min-w-0 p-4 md:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-slate-900 truncate min-w-0">{t('executive.compare.title')}</h1>
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
          <button type="button" onClick={prevMonth} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
            ‹
          </button>
          <span className="text-sm font-medium text-slate-800 tabular-nums min-w-0 truncate">{month}</span>
          <button type="button" onClick={nextMonth} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
            ›
          </button>
        </div>
      </div>

      {loading && <p className="text-sm text-slate-500">{t('common.loading')}</p>}
      {!loading && !data && <p className="text-sm text-amber-700">{t('executive.compare.error')}</p>}

      {!loading && data && (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 mb-6">
            <OpsCard title={t('executive.compare.top3')}>
              <ul className="space-y-2">
                {top3.map((b, i) => (
                  <li key={b.boutiqueId} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate min-w-0">{i + 1}. {b.name}</span>
                    <span className="shrink-0 text-emerald-700 font-medium">{b.achievementPct ?? 0}%</span>
                  </li>
                ))}
                {top3.length === 0 && <li className="text-slate-500 text-sm">{t('executive.compare.noData')}</li>}
              </ul>
            </OpsCard>
            <OpsCard title={t('executive.compare.bottom3')}>
              <ul className="space-y-2">
                {bottom3.map((b) => (
                  <li key={b.boutiqueId} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate min-w-0">{b.name}</span>
                    <span className="shrink-0 text-amber-700 font-medium">{b.achievementPct ?? 0}%</span>
                  </li>
                ))}
                {bottom3.length === 0 && <li className="text-slate-500 text-sm">{t('executive.compare.noData')}</li>}
              </ul>
            </OpsCard>
          </div>

          <OpsCard title={t('executive.compare.rankingTable')} className="mb-6">
            <AdminDataTable>
              <AdminTableHead>
                <AdminTh className="w-[20%]">{t('executive.compare.boutique')}</AdminTh>
                <AdminTh className="w-[12%]">{t('executive.compare.region')}</AdminTh>
                <AdminTh className="w-[12%]">{t('executive.compare.revenue')}</AdminTh>
                <AdminTh className="w-[12%]">{t('executive.compare.target')}</AdminTh>
                <AdminTh className="w-[10%]">{t('executive.compare.achPct')}</AdminTh>
                <AdminTh className="w-[10%]">{t('executive.compare.overduePct')}</AdminTh>
                <AdminTh className="w-[10%]">{t('executive.compare.riskScore')}</AdminTh>
                <AdminTh className="w-[14%]">{t('common.edit')}</AdminTh>
              </AdminTableHead>
              <AdminTableBody>
                {sorted.map((b) => (
                  <tr key={b.boutiqueId}>
                    <AdminTd className="truncate min-w-0" title={b.name}>{b.name}</AdminTd>
                    <AdminTd className="truncate min-w-0">{b.regionName ?? b.regionCode ?? '—'}</AdminTd>
                    <AdminTd className="tabular-nums">{formatSar(b.sales)}</AdminTd>
                    <AdminTd className="tabular-nums">{formatSar(b.target)}</AdminTd>
                    <AdminTd className={`tabular-nums ${b.achievementPct != null && b.achievementPct < 20 ? 'text-amber-700' : 'text-slate-900'}`}>{b.achievementPct != null ? `${b.achievementPct}%` : '—'}</AdminTd>
                    <AdminTd className="tabular-nums text-slate-900">{b.overduePct}%</AdminTd>
                    <AdminTd className="tabular-nums">{b.riskScore}</AdminTd>
                    <AdminTd>
                      <Link
                        href={`/executive/insights?boutiqueId=${encodeURIComponent(b.boutiqueId)}`}
                        className="text-sky-600 hover:underline text-sm truncate block min-w-0"
                      >
                        {t('executive.compare.drilldown')}
                      </Link>
                    </AdminTd>
                  </tr>
                ))}
              </AdminTableBody>
            </AdminDataTable>
          </OpsCard>

          {data.regions.length > 0 && (
            <OpsCard title={t('executive.compare.regionRollup')} className="mb-6">
              <AdminDataTable>
                <AdminTableHead>
                  <AdminTh>{t('executive.compare.region')}</AdminTh>
                  <AdminTh>{t('executive.compare.revenue')}</AdminTh>
                  <AdminTh>{t('executive.compare.target')}</AdminTh>
                  <AdminTh>{t('executive.compare.achPct')}</AdminTh>
                </AdminTableHead>
                <AdminTableBody>
                  {data.regions.map((r) => (
                    <tr key={r.regionId ?? 'none'}>
                      <AdminTd className="truncate min-w-0">{r.regionName ?? r.regionCode ?? '—'}</AdminTd>
                      <AdminTd className="tabular-nums">{formatSar(r.sales)}</AdminTd>
                      <AdminTd className="tabular-nums">{formatSar(r.target)}</AdminTd>
                      <AdminTd className={`tabular-nums ${r.achievementPct != null && r.achievementPct < 20 ? 'text-amber-700' : 'text-slate-900'}`}>{r.achievementPct != null ? `${r.achievementPct}%` : '—'}</AdminTd>
                    </tr>
                  ))}
                </AdminTableBody>
              </AdminDataTable>
            </OpsCard>
          )}

          {data.groups.length > 0 && (
            <OpsCard title={t('executive.compare.groupRollup')}>
              <AdminDataTable>
                <AdminTableHead>
                  <AdminTh>{t('executive.compare.group')}</AdminTh>
                  <AdminTh>{t('executive.compare.revenue')}</AdminTh>
                  <AdminTh>{t('executive.compare.target')}</AdminTh>
                  <AdminTh>{t('executive.compare.achPct')}</AdminTh>
                </AdminTableHead>
                <AdminTableBody>
                  {data.groups.map((g) => (
                    <tr key={g.groupId}>
                      <AdminTd className="truncate min-w-0" title={g.groupName}>{g.groupName}</AdminTd>
                      <AdminTd className="tabular-nums">{formatSar(g.sales)}</AdminTd>
                      <AdminTd className="tabular-nums">{formatSar(g.target)}</AdminTd>
                      <AdminTd className={`tabular-nums ${g.achievementPct != null && g.achievementPct < 20 ? 'text-amber-700' : 'text-slate-900'}`}>{g.achievementPct != null ? `${g.achievementPct}%` : '—'}</AdminTd>
                    </tr>
                  ))}
                </AdminTableBody>
              </AdminDataTable>
            </OpsCard>
          )}
        </>
      )}
    </div>
  );
}
