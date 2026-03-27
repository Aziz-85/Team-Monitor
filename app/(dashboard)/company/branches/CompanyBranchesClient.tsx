'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useT } from '@/lib/i18n/useT';
import { OpsCard } from '@/components/ui/OpsCard';
import { CompanyPageHeader } from '@/components/company/CompanyPageHeader';
import { CompanyLoadingSkeleton } from '@/components/company/CompanyLoadingSkeleton';
import { formatSarInt } from '@/lib/utils/money';
import type { CompanyBranchRow } from '@/lib/company/types';
import type { PaceBand } from '@/lib/analytics/performanceLayer';
import { companyPaceLabelKey, paceBandSortOrder } from '@/lib/company/companyPaceUi';
import {
  AdminDataTable,
  AdminTableHead,
  AdminTh,
  AdminTableBody,
  AdminTd,
} from '@/components/admin/AdminDataTable';

function monthDefault() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

type BranchSortKey =
  | 'name'
  | 'actualMtd'
  | 'targetMtd'
  | 'remaining'
  | 'achievementPct'
  | 'paceBand'
  | 'forecastEom'
  | 'alertCount';

const selectClass =
  'w-full min-w-0 max-w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground';

export function CompanyBranchesClient() {
  const { t } = useT();
  const [month, setMonth] = useState(monthDefault);
  const [branches, setBranches] = useState<CompanyBranchRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState('');
  const [paceFilter, setPaceFilter] = useState<'all' | PaceBand>('all');
  const [sortKey, setSortKey] = useState<BranchSortKey>('achievementPct');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    fetch(`/api/company/branches?month=${encodeURIComponent(month)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load'))))
      .then((res: { branches: CompanyBranchRow[] }) => setBranches(res.branches))
      .catch(() => {
        setBranches(null);
        setError(true);
      })
      .finally(() => setLoading(false));
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredSorted = useMemo(() => {
    if (!branches) return [];
    const q = search.trim().toLowerCase();
    let rows = branches.filter((r) => {
      if (paceFilter !== 'all' && r.paceBand !== paceFilter) return false;
      if (!q) return true;
      return r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q);
    });

    const mul = sortDir === 'asc' ? 1 : -1;
    const cmp = (a: CompanyBranchRow, b: CompanyBranchRow): number => {
      switch (sortKey) {
        case 'name':
          return mul * a.name.localeCompare(b.name);
        case 'actualMtd':
          return mul * (a.actualMtd - b.actualMtd);
        case 'targetMtd':
          return mul * (a.targetMtd - b.targetMtd);
        case 'remaining':
          return mul * (a.remaining - b.remaining);
        case 'achievementPct': {
          const av = a.achievementPct ?? -1;
          const bv = b.achievementPct ?? -1;
          return mul * (av - bv);
        }
        case 'paceBand':
          return mul * (paceBandSortOrder(a.paceBand) - paceBandSortOrder(b.paceBand));
        case 'forecastEom':
          return mul * (a.forecastEom - b.forecastEom);
        case 'alertCount':
          return mul * (a.alertCount - b.alertCount);
        default:
          return 0;
      }
    };
    rows = [...rows].sort(cmp);
    return rows;
  }, [branches, search, paceFilter, sortKey, sortDir]);

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-6 px-3 py-6 md:px-6">
      <CompanyPageHeader
        title={t('companyBackoffice.branchesTitle')}
        description={t('companyBackoffice.subtitle')}
        month={month}
        onMonthChange={setMonth}
      />

      {loading && <CompanyLoadingSkeleton rows={2} />}

      {!loading && error && (
        <OpsCard title={t('companyBackoffice.loadError')}>
          <p className="text-sm text-destructive">{t('companyBackoffice.loadError')}</p>
          <button
            type="button"
            onClick={() => load()}
            className="mt-3 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90"
          >
            {t('companyBackoffice.retryLoad')}
          </button>
        </OpsCard>
      )}

      {!loading && !error && branches && (
        <>
          <OpsCard title={t('companyBackoffice.filtersSummary')}>
            <div className="mt-2 grid w-full min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="flex min-w-0 max-w-full flex-col gap-1 text-start">
                <span className="text-xs font-medium text-muted-foreground">
                  {t('companyBackoffice.searchBranches')}
                </span>
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('common.search')}
                  className={selectClass}
                  autoComplete="off"
                />
              </label>
              <label className="flex min-w-0 max-w-full flex-col gap-1 text-start">
                <span className="text-xs font-medium text-muted-foreground">
                  {t('companyBackoffice.filterPace')}
                </span>
                <select
                  className={selectClass}
                  value={paceFilter}
                  onChange={(e) => setPaceFilter(e.target.value as 'all' | PaceBand)}
                >
                  <option value="all">{t('companyBackoffice.filterPaceAll')}</option>
                  <option value="ahead">{t('analytics.ahead')}</option>
                  <option value="onTrack">{t('analytics.onTrack')}</option>
                  <option value="behind">{t('analytics.behind')}</option>
                </select>
              </label>
              <label className="flex min-w-0 max-w-full flex-col gap-1 text-start">
                <span className="text-xs font-medium text-muted-foreground">
                  {t('companyBackoffice.sortBy')}
                </span>
                <select
                  className={selectClass}
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value as BranchSortKey)}
                >
                  <option value="achievementPct">{t('companyBackoffice.sortAchievement')}</option>
                  <option value="actualMtd">{t('companyBackoffice.sortActualMtd')}</option>
                  <option value="targetMtd">{t('companyBackoffice.sortTarget')}</option>
                  <option value="remaining">{t('companyBackoffice.sortRemaining')}</option>
                  <option value="paceBand">{t('companyBackoffice.sortPace')}</option>
                  <option value="forecastEom">{t('companyBackoffice.sortForecast')}</option>
                  <option value="alertCount">{t('companyBackoffice.sortAlerts')}</option>
                  <option value="name">{t('companyBackoffice.sortName')}</option>
                </select>
              </label>
              <label className="flex min-w-0 max-w-full flex-col gap-1 text-start">
                <span className="text-xs font-medium text-muted-foreground">
                  {t('companyBackoffice.sortOrder')}
                </span>
                <select
                  className={selectClass}
                  value={sortDir}
                  onChange={(e) => setSortDir(e.target.value as 'asc' | 'desc')}
                >
                  <option value="desc">{t('companyBackoffice.sortDirDesc')}</option>
                  <option value="asc">{t('companyBackoffice.sortDirAsc')}</option>
                </select>
              </label>
            </div>
          </OpsCard>

          <OpsCard>
            <p className="mb-3 text-sm text-muted-foreground">
              {filteredSorted.length} / {branches.length}
            </p>
            <div className="hidden min-w-0 max-w-full md:block">
              <AdminDataTable>
                <AdminTableHead>
                  <tr>
                    <AdminTh>{t('common.name')}</AdminTh>
                    <AdminTh>{t('analytics.actualMtd')}</AdminTh>
                    <AdminTh>{t('analytics.target')}</AdminTh>
                    <AdminTh>{t('analytics.remaining')}</AdminTh>
                    <AdminTh>{t('companyBackoffice.achievement')}</AdminTh>
                    <AdminTh>{t('companyBackoffice.pace')}</AdminTh>
                    <AdminTh>{t('analytics.forecastEom')}</AdminTh>
                    <AdminTh>{t('companyBackoffice.employeeCount')}</AdminTh>
                    <AdminTh>{t('companyBackoffice.alertCount')}</AdminTh>
                  </tr>
                </AdminTableHead>
                <AdminTableBody>
                  {filteredSorted.map((r) => (
                    <tr key={r.boutiqueId}>
                      <AdminTd className="min-w-0 max-w-[12rem]">
                        <span className="break-words font-medium">{r.name}</span>
                        <span className="ms-1 text-muted-foreground">({r.code})</span>
                      </AdminTd>
                      <AdminTd className="tabular-nums">{formatSarInt(r.actualMtd)}</AdminTd>
                      <AdminTd className="tabular-nums">{formatSarInt(r.targetMtd)}</AdminTd>
                      <AdminTd className="tabular-nums">{formatSarInt(r.remaining)}</AdminTd>
                      <AdminTd className="tabular-nums">
                        {r.achievementPct != null ? `${r.achievementPct}%` : '—'}
                      </AdminTd>
                      <AdminTd>{t(companyPaceLabelKey(r.paceBand))}</AdminTd>
                      <AdminTd className="tabular-nums">{formatSarInt(r.forecastEom)}</AdminTd>
                      <AdminTd className="tabular-nums">{r.employeeCount}</AdminTd>
                      <AdminTd className="tabular-nums">{r.alertCount}</AdminTd>
                    </tr>
                  ))}
                </AdminTableBody>
              </AdminDataTable>
            </div>

            <ul className="space-y-3 md:hidden">
              {filteredSorted.map((r) => (
                <li
                  key={r.boutiqueId}
                  className="rounded-lg border border-border bg-background/60 px-3 py-3 text-sm"
                >
                  <div className="font-semibold break-words text-foreground">
                    {r.name}{' '}
                    <span className="font-normal text-muted-foreground">({r.code})</span>
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <dt>{t('analytics.actualMtd')}</dt>
                    <dd className="text-end tabular-nums text-foreground">{formatSarInt(r.actualMtd)}</dd>
                    <dt>{t('analytics.target')}</dt>
                    <dd className="text-end tabular-nums text-foreground">{formatSarInt(r.targetMtd)}</dd>
                    <dt>{t('companyBackoffice.achievement')}</dt>
                    <dd className="text-end tabular-nums text-foreground">
                      {r.achievementPct != null ? `${r.achievementPct}%` : '—'}
                    </dd>
                    <dt>{t('companyBackoffice.pace')}</dt>
                    <dd className="text-end text-foreground">{t(companyPaceLabelKey(r.paceBand))}</dd>
                    <dt>{t('companyBackoffice.alertCount')}</dt>
                    <dd className="text-end tabular-nums text-foreground">{r.alertCount}</dd>
                  </dl>
                </li>
              ))}
            </ul>
          </OpsCard>
        </>
      )}
    </div>
  );
}
