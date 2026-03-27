'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale } from 'next-intl';
import type { Role } from '@prisma/client';
import { useT } from '@/lib/i18n/useT';
import { OpsCard } from '@/components/ui/OpsCard';
import { CompanyPageHeader } from '@/components/company/CompanyPageHeader';
import { CompanyLoadingSkeleton } from '@/components/company/CompanyLoadingSkeleton';
import { formatSarInt } from '@/lib/utils/money';
import { getEmployeeDisplayName } from '@/lib/employees/getEmployeeDisplayName';
import type { CompanyEmployeeRow } from '@/lib/company/types';
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

type EmpSortKey =
  | 'name'
  | 'boutiqueName'
  | 'actualMtd'
  | 'targetMtd'
  | 'paceBand'
  | 'contributionPct';

const selectClass =
  'w-full min-w-0 max-w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground';

function roleLabelKey(role: Role): string {
  const map: Partial<Record<Role, string>> = {
    EMPLOYEE: 'adminEmp.roleEmployee',
    MANAGER: 'adminEmp.roleManager',
    ASSISTANT_MANAGER: 'adminEmp.roleAssistantManager',
    ADMIN: 'adminEmp.roleAdmin',
    AREA_MANAGER: 'adminEmp.roleAreaManager',
    SUPER_ADMIN: 'adminEmp.roleSuperAdmin',
    DEMO_VIEWER: 'adminEmp.roleDemoViewer',
  };
  return map[role] ?? 'common.role';
}

const ROLE_OPTIONS: Role[] = [
  'EMPLOYEE',
  'MANAGER',
  'ASSISTANT_MANAGER',
  'ADMIN',
  'AREA_MANAGER',
  'SUPER_ADMIN',
  'DEMO_VIEWER',
];

export function CompanyEmployeesClient() {
  const { t } = useT();
  const locale = useLocale();
  const [month, setMonth] = useState(monthDefault);
  const [employees, setEmployees] = useState<CompanyEmployeeRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState('');
  const [boutiqueId, setBoutiqueId] = useState<string>('all');
  const [roleFilter, setRoleFilter] = useState<Role | 'all'>('all');
  const [paceFilter, setPaceFilter] = useState<'all' | PaceBand>('all');
  const [sortKey, setSortKey] = useState<EmpSortKey>('actualMtd');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    fetch(`/api/company/employees?month=${encodeURIComponent(month)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load'))))
      .then((res: { employees: CompanyEmployeeRow[] }) => setEmployees(res.employees))
      .catch(() => {
        setEmployees(null);
        setError(true);
      })
      .finally(() => setLoading(false));
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  const boutiqueOptions = useMemo(() => {
    if (!employees) return [];
    const m = new Map<string, { id: string; label: string }>();
    for (const e of employees) {
      if (!m.has(e.boutiqueId)) {
        m.set(e.boutiqueId, { id: e.boutiqueId, label: `${e.boutiqueName} (${e.boutiqueCode})` });
      }
    }
    return Array.from(m.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [employees]);

  const filteredSorted = useMemo(() => {
    if (!employees) return [];
    const q = search.trim().toLowerCase();
    let rows = employees.filter((r) => {
      if (boutiqueId !== 'all' && r.boutiqueId !== boutiqueId) return false;
      if (roleFilter !== 'all' && r.role !== roleFilter) return false;
      if (paceFilter !== 'all' && r.paceBand !== paceFilter) return false;
      if (!q) return true;
      const display = getEmployeeDisplayName({ name: r.name, nameAr: r.nameAr }, locale).toLowerCase();
      return (
        display.includes(q) ||
        r.empId.toLowerCase().includes(q) ||
        r.boutiqueName.toLowerCase().includes(q) ||
        r.boutiqueCode.toLowerCase().includes(q)
      );
    });

    const mul = sortDir === 'asc' ? 1 : -1;
    rows = [...rows].sort((a, b) => {
      switch (sortKey) {
        case 'name': {
          const an = getEmployeeDisplayName({ name: a.name, nameAr: a.nameAr }, locale);
          const bn = getEmployeeDisplayName({ name: b.name, nameAr: b.nameAr }, locale);
          return mul * an.localeCompare(bn);
        }
        case 'boutiqueName':
          return mul * a.boutiqueName.localeCompare(b.boutiqueName);
        case 'actualMtd':
          return mul * (a.actualMtd - b.actualMtd);
        case 'targetMtd':
          return mul * ((a.targetMtd ?? -1) - (b.targetMtd ?? -1));
        case 'paceBand':
          return mul * (paceBandSortOrder(a.paceBand) - paceBandSortOrder(b.paceBand));
        case 'contributionPct': {
          const ac = a.productivity?.contributionPct ?? -1;
          const bc = b.productivity?.contributionPct ?? -1;
          return mul * (ac - bc);
        }
        default:
          return 0;
      }
    });
    return rows;
  }, [
    employees,
    search,
    boutiqueId,
    roleFilter,
    paceFilter,
    sortKey,
    sortDir,
    locale,
  ]);

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-6 px-3 py-6 md:px-6">
      <CompanyPageHeader
        title={t('companyBackoffice.employeesTitle')}
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

      {!loading && !error && employees && (
        <>
          <OpsCard title={t('companyBackoffice.filtersSummary')}>
            <div className="mt-2 grid w-full min-w-0 grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              <label className="flex min-w-0 max-w-full flex-col gap-1 text-start">
                <span className="text-xs font-medium text-muted-foreground">
                  {t('companyBackoffice.searchEmployees')}
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
                  {t('companyBackoffice.filterBoutique')}
                </span>
                <select
                  className={selectClass}
                  value={boutiqueId}
                  onChange={(e) => setBoutiqueId(e.target.value)}
                >
                  <option value="all">{t('companyBackoffice.filterBoutiqueAll')}</option>
                  {boutiqueOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex min-w-0 max-w-full flex-col gap-1 text-start">
                <span className="text-xs font-medium text-muted-foreground">
                  {t('companyBackoffice.filterRole')}
                </span>
                <select
                  className={selectClass}
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value as Role | 'all')}
                >
                  <option value="all">{t('companyBackoffice.filterRoleAll')}</option>
                  {ROLE_OPTIONS.map((role) => (
                    <option key={role} value={role}>
                      {t(roleLabelKey(role))}
                    </option>
                  ))}
                </select>
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
                  onChange={(e) => setSortKey(e.target.value as EmpSortKey)}
                >
                  <option value="actualMtd">{t('companyBackoffice.sortActualMtd')}</option>
                  <option value="targetMtd">{t('companyBackoffice.sortTarget')}</option>
                  <option value="paceBand">{t('companyBackoffice.sortPace')}</option>
                  <option value="contributionPct">{t('companyBackoffice.sortContribution')}</option>
                  <option value="name">{t('companyBackoffice.sortName')}</option>
                  <option value="boutiqueName">{t('common.workingOnBoutiqueShort')}</option>
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
              {filteredSorted.length} / {employees.length}
            </p>
            <div className="hidden min-w-0 max-w-full lg:block">
              <AdminDataTable>
                <AdminTableHead>
                  <tr>
                    <AdminTh>{t('analytics.employee')}</AdminTh>
                    <AdminTh>{t('common.workingOnBoutiqueShort')}</AdminTh>
                    <AdminTh>{t('common.role')}</AdminTh>
                    <AdminTh>{t('analytics.actualMtd')}</AdminTh>
                    <AdminTh>{t('analytics.target')}</AdminTh>
                    <AdminTh>{t('companyBackoffice.achievement')}</AdminTh>
                    <AdminTh>{t('companyBackoffice.pace')}</AdminTh>
                    <AdminTh>{t('analytics.contribution')}</AdminTh>
                    <AdminTh>{t('analytics.activeDays')}</AdminTh>
                  </tr>
                </AdminTableHead>
                <AdminTableBody>
                  {filteredSorted.map((r) => (
                    <tr key={r.userId}>
                      <AdminTd className="min-w-0 max-w-[11rem]">
                        <span className="break-words font-medium">
                          {getEmployeeDisplayName({ name: r.name, nameAr: r.nameAr }, locale)}
                        </span>
                      </AdminTd>
                      <AdminTd className="min-w-0 max-w-[10rem]">
                        <span className="break-words">{r.boutiqueName}</span>
                        <span className="ms-1 text-muted-foreground">({r.boutiqueCode})</span>
                      </AdminTd>
                      <AdminTd className="whitespace-nowrap">{t(roleLabelKey(r.role))}</AdminTd>
                      <AdminTd className="tabular-nums">{formatSarInt(r.actualMtd)}</AdminTd>
                      <AdminTd className="tabular-nums">
                        {r.targetMtd != null ? formatSarInt(r.targetMtd) : '—'}
                      </AdminTd>
                      <AdminTd className="tabular-nums">
                        {r.achievementPct != null ? `${r.achievementPct}%` : '—'}
                      </AdminTd>
                      <AdminTd>{t(companyPaceLabelKey(r.paceBand))}</AdminTd>
                      <AdminTd className="tabular-nums">
                        {r.productivity ? `${r.productivity.contributionPct}%` : '—'}
                      </AdminTd>
                      <AdminTd className="tabular-nums">
                        {r.productivity?.activeDays ?? 0}
                      </AdminTd>
                    </tr>
                  ))}
                </AdminTableBody>
              </AdminDataTable>
            </div>

            <ul className="space-y-3 lg:hidden">
              {filteredSorted.map((r) => (
                <li
                  key={r.userId}
                  className="rounded-lg border border-border bg-background/60 px-3 py-3 text-sm"
                >
                  <div className="font-semibold break-words text-foreground">
                    {getEmployeeDisplayName({ name: r.name, nameAr: r.nameAr }, locale)}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {r.boutiqueName} ({r.boutiqueCode}) · {t(roleLabelKey(r.role))} ·{' '}
                    {t(companyPaceLabelKey(r.paceBand))}
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <dt>{t('analytics.actualMtd')}</dt>
                    <dd className="text-end tabular-nums text-foreground">{formatSarInt(r.actualMtd)}</dd>
                    <dt>{t('analytics.target')}</dt>
                    <dd className="text-end tabular-nums text-foreground">
                      {r.targetMtd != null ? formatSarInt(r.targetMtd) : '—'}
                    </dd>
                    <dt>{t('analytics.contribution')}</dt>
                    <dd className="text-end tabular-nums text-foreground">
                      {r.productivity ? `${r.productivity.contributionPct}%` : '—'}
                    </dd>
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
