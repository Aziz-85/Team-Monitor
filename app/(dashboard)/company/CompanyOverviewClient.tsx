'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useLocale } from 'next-intl';
import { useT } from '@/lib/i18n/useT';
import { OpsCard } from '@/components/ui/OpsCard';
import { CompanyPageHeader } from '@/components/company/CompanyPageHeader';
import { CompanyLoadingSkeleton } from '@/components/company/CompanyLoadingSkeleton';
import { CompanyAlertLevelBadge } from '@/components/company/CompanyAlertLevelBadge';
import { formatSarInt } from '@/lib/utils/money';
import { getEmployeeDisplayName } from '@/lib/employees/getEmployeeDisplayName';
import type { CompanyOverviewPayload } from '@/lib/company/types';
import { formatCompanyAlertMessage } from '@/lib/company/formatCompanyAlertMessage';
import { companyPaceLabelKey } from '@/lib/company/companyPaceUi';
import { interpolateLabel } from '@/lib/company/interpolateLabels';
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

function executiveStripBorder(paceBand: string): string {
  if (paceBand === 'behind') return 'border-s-4 border-s-destructive';
  if (paceBand === 'ahead') return 'border-s-4 border-s-emerald-600 dark:border-s-emerald-500';
  return 'border-s-4 border-s-amber-500 dark:border-s-amber-400';
}

export function CompanyOverviewClient() {
  const { t } = useT();
  const locale = useLocale();
  const [month, setMonth] = useState(monthDefault);
  const [data, setData] = useState<CompanyOverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    fetch(`/api/company/overview?month=${encodeURIComponent(month)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load'))))
      .then(setData)
      .catch(() => {
        setData(null);
        setError(true);
      })
      .finally(() => setLoading(false));
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  const highAlertCount = useMemo(
    () => data?.alertsPreview.filter((a) => a.level === 'high').length ?? 0,
    [data]
  );

  const branchPreviewRows = useMemo(() => {
    if (!data) return [];
    return [...data.branchSummaries]
      .sort((a, b) => (b.achievementPct ?? -1) - (a.achievementPct ?? -1))
      .slice(0, 6);
  }, [data]);

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-8 px-3 py-6 md:px-6">
      <CompanyPageHeader
        title={t('companyBackoffice.overviewTitle')}
        description={t('companyBackoffice.subtitle')}
        month={month}
        onMonthChange={setMonth}
      />

      {loading && <CompanyLoadingSkeleton rows={4} />}

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

      {!loading && !error && data && data.activeBoutiqueCount === 0 && (
        <OpsCard title={t('companyBackoffice.networkScale')}>
          <p className="text-sm text-muted-foreground">{t('companyBackoffice.emptyNetwork')}</p>
        </OpsCard>
      )}

      {!loading && !error && data && data.activeBoutiqueCount > 0 && (
        <>
          <section
            className={`rounded-xl border border-border bg-surface p-4 shadow-sm md:p-6 ${executiveStripBorder(data.paceBand)}`}
          >
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t('companyBackoffice.executiveSummary')}
            </h2>
            <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">{t('companyBackoffice.atAGlance')}</p>
                <p className="mt-1 text-3xl font-bold tracking-tight text-foreground md:text-4xl">
                  {t(companyPaceLabelKey(data.paceBand))}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {t('companyBackoffice.networkRemaining')}:{' '}
                  <span className="font-semibold tabular-nums text-foreground">
                    {formatSarInt(data.networkRemaining)}
                  </span>
                  <span className="mx-2 text-border">·</span>
                  {t('companyBackoffice.forecast')}:{' '}
                  <span className="font-semibold tabular-nums text-foreground">
                    {formatSarInt(data.forecastEom)}
                  </span>
                </p>
              </div>
              <div className="min-w-0 text-start lg:max-w-md lg:text-end">
                {highAlertCount > 0 ? (
                  <p className="text-sm font-medium text-destructive">
                    {interpolateLabel(t('companyBackoffice.highPriorityAlertCount'), {
                      count: highAlertCount,
                    })}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {t('companyBackoffice.noHighPriorityAlerts')}
                  </p>
                )}
                <Link
                  href="/company/alerts"
                  className="mt-2 inline-block text-sm font-semibold text-accent hover:underline"
                >
                  {t('companyBackoffice.alertsTitle')} →
                </Link>
              </div>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t('companyBackoffice.networkScale')}
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <OpsCard title={t('companyBackoffice.networkActualMtd')}>
                <p className="text-2xl font-semibold tabular-nums">{formatSarInt(data.networkActualMtd)}</p>
              </OpsCard>
              <OpsCard title={t('companyBackoffice.networkTargetMtd')}>
                <p className="text-2xl font-semibold tabular-nums">{formatSarInt(data.networkTargetMtd)}</p>
              </OpsCard>
              <OpsCard title={t('companyBackoffice.networkRemaining')}>
                <p className="text-2xl font-semibold tabular-nums">{formatSarInt(data.networkRemaining)}</p>
              </OpsCard>
              <OpsCard title={t('companyBackoffice.pace')}>
                <p className="text-xl font-semibold">{t(companyPaceLabelKey(data.paceBand))}</p>
                <p className="mt-1 text-sm text-muted-foreground tabular-nums">
                  Δ {formatSarInt(data.paceDelta)}
                </p>
              </OpsCard>
              <OpsCard title={t('companyBackoffice.forecast')}>
                <p className="text-2xl font-semibold tabular-nums">{formatSarInt(data.forecastEom)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('companyBackoffice.forecastDelta')}: {formatSarInt(data.forecastDelta)}
                </p>
              </OpsCard>
              <OpsCard title={`${t('companyBackoffice.activeBoutiques')} / ${t('companyBackoffice.activeEmployees')}`}>
                <p className="text-2xl font-semibold tabular-nums">
                  {data.activeBoutiqueCount} <span className="text-muted-foreground">/</span>{' '}
                  {data.activeEmployeeCount}
                </p>
              </OpsCard>
            </div>
          </section>

          <OpsCard title={t('companyBackoffice.branchPerformancePreview')}>
            <div className="mt-1 hidden min-w-0 max-w-full md:block">
              <AdminDataTable>
                <AdminTableHead>
                  <tr>
                    <AdminTh>{t('common.name')}</AdminTh>
                    <AdminTh>{t('analytics.actualMtd')}</AdminTh>
                    <AdminTh>{t('analytics.target')}</AdminTh>
                    <AdminTh>{t('companyBackoffice.achievement')}</AdminTh>
                    <AdminTh>{t('companyBackoffice.pace')}</AdminTh>
                  </tr>
                </AdminTableHead>
                <AdminTableBody>
                  {branchPreviewRows.map((r) => (
                    <tr key={r.boutiqueId}>
                      <AdminTd className="min-w-0 max-w-[10rem]">
                        <span className="break-words font-medium">{r.name}</span>
                        <span className="ms-1 text-muted-foreground">({r.code})</span>
                      </AdminTd>
                      <AdminTd className="tabular-nums">{formatSarInt(r.actualMtd)}</AdminTd>
                      <AdminTd className="tabular-nums">{formatSarInt(r.targetMtd)}</AdminTd>
                      <AdminTd className="tabular-nums">
                        {r.achievementPct != null ? `${r.achievementPct}%` : '—'}
                      </AdminTd>
                      <AdminTd>{t(companyPaceLabelKey(r.paceBand))}</AdminTd>
                    </tr>
                  ))}
                </AdminTableBody>
              </AdminDataTable>
            </div>
            <ul className="mt-2 space-y-3 md:hidden">
              {branchPreviewRows.map((r) => (
                <li
                  key={r.boutiqueId}
                  className="rounded-lg border border-border bg-background/50 px-3 py-2 text-sm"
                >
                  <div className="font-medium break-words">
                    {r.name}{' '}
                    <span className="text-muted-foreground">({r.code})</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground tabular-nums">
                    <span>
                      {t('analytics.actualMtd')}: {formatSarInt(r.actualMtd)}
                    </span>
                    <span>
                      {t('companyBackoffice.achievement')}:{' '}
                      {r.achievementPct != null ? `${r.achievementPct}%` : '—'}
                    </span>
                    <span>{t(companyPaceLabelKey(r.paceBand))}</span>
                  </div>
                </li>
              ))}
            </ul>
            <Link
              href="/company/branches"
              className="mt-4 inline-block text-sm font-semibold text-accent hover:underline"
            >
              {t('companyBackoffice.viewAllBranches')} →
            </Link>
          </OpsCard>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <OpsCard title={t('companyBackoffice.topBranches')}>
              <ul className="mt-2 space-y-2 text-sm">
                {data.topBranches.length === 0 && (
                  <li className="text-muted-foreground">—</li>
                )}
                {data.topBranches.map((r) => (
                  <li key={r.boutiqueId} className="flex flex-wrap justify-between gap-2">
                    <span className="min-w-0 break-words font-medium">{r.name}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {r.achievementPct != null ? `${r.achievementPct}%` : '—'}
                    </span>
                  </li>
                ))}
              </ul>
            </OpsCard>
            <OpsCard title={t('companyBackoffice.bottomBranches')}>
              <ul className="mt-2 space-y-2 text-sm">
                {data.bottomBranches.length === 0 && (
                  <li className="text-muted-foreground">—</li>
                )}
                {data.bottomBranches.map((r) => (
                  <li key={r.boutiqueId} className="flex flex-wrap justify-between gap-2">
                    <span className="min-w-0 break-words font-medium">{r.name}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {r.achievementPct != null ? `${r.achievementPct}%` : '—'}
                    </span>
                  </li>
                ))}
              </ul>
            </OpsCard>
          </div>

          <OpsCard title={t('companyBackoffice.alertsPreview')}>
            {data.alertsPreview.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">{t('companyBackoffice.noAlerts')}</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {data.alertsPreview.map((a, i) => (
                  <li
                    key={`${a.kind}-${a.boutiqueId}-${i}`}
                    className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3 sm:flex-row sm:items-start sm:gap-3"
                  >
                    <CompanyAlertLevelBadge level={a.level} />
                    <p className="min-w-0 flex-1 text-sm leading-relaxed text-foreground">
                      {formatCompanyAlertMessage(t(`companyBackoffice.alertsMeta.${a.kind}`), a)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <Link
              href="/company/alerts"
              className="mt-4 inline-block text-sm font-semibold text-accent hover:underline"
            >
              {t('companyBackoffice.alertsTitle')} →
            </Link>
          </OpsCard>

          <OpsCard title={t('companyBackoffice.employeeHighlights')}>
            {data.employeeHighlights.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">—</p>
            ) : (
              <ul className="mt-2 space-y-2 text-sm">
                {data.employeeHighlights.map((e) => (
                  <li
                    key={e.userId}
                    className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/60 pb-2 last:border-0"
                  >
                    <span className="min-w-0 break-words font-medium">
                      {getEmployeeDisplayName({ name: e.name, nameAr: e.nameAr }, locale)}
                      <span className="ms-1 font-normal text-muted-foreground">({e.boutiqueCode})</span>
                    </span>
                    <span className="tabular-nums">{formatSarInt(e.actualMtd)}</span>
                  </li>
                ))}
              </ul>
            )}
          </OpsCard>
        </>
      )}
    </div>
  );
}
