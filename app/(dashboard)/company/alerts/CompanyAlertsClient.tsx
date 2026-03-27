'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useT } from '@/lib/i18n/useT';
import { OpsCard } from '@/components/ui/OpsCard';
import { CompanyPageHeader } from '@/components/company/CompanyPageHeader';
import { CompanyLoadingSkeleton } from '@/components/company/CompanyLoadingSkeleton';
import { CompanyAlertLevelBadge } from '@/components/company/CompanyAlertLevelBadge';
import type { CompanyAlertItem, CompanyAlertLevel } from '@/lib/company/types';
import { formatCompanyAlertMessage } from '@/lib/company/formatCompanyAlertMessage';
import { COMPANY_ALERT_KIND_ORDER } from '@/lib/company/companyAlertPipeline';
import { interpolateLabel } from '@/lib/company/interpolateLabels';

function monthDefault() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const LEVEL_RANK: Record<CompanyAlertLevel, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

function groupAlertsByBoutique(alerts: CompanyAlertItem[]): [string, CompanyAlertItem[]][] {
  const m = new Map<string, CompanyAlertItem[]>();
  for (const a of alerts) {
    if (!m.has(a.boutiqueId)) m.set(a.boutiqueId, []);
    m.get(a.boutiqueId)!.push(a);
  }
  for (const list of Array.from(m.values())) {
    list.sort((a: CompanyAlertItem, b: CompanyAlertItem) => {
      const lr = LEVEL_RANK[a.level] - LEVEL_RANK[b.level];
      if (lr !== 0) return lr;
      return COMPANY_ALERT_KIND_ORDER[a.kind] - COMPANY_ALERT_KIND_ORDER[b.kind];
    });
  }
  return Array.from(m.entries()).sort(([, la], [, lb]) => {
    const worst = (items: CompanyAlertItem[]) =>
      Math.min(...items.map((i) => LEVEL_RANK[i.level]));
    const w = worst(la) - worst(lb);
    if (w !== 0) return w;
    return (la[0]?.boutiqueName ?? '').localeCompare(lb[0]?.boutiqueName ?? '');
  });
}

type AlertsApiResponse = {
  monthKey: string;
  daysInMonth: number;
  daysPassed: number;
  currentMonthKey: string;
  alerts: CompanyAlertItem[];
};

export function CompanyAlertsClient() {
  const { t } = useT();
  const [month, setMonth] = useState(monthDefault);
  const [payload, setPayload] = useState<AlertsApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    fetch(`/api/company/alerts?month=${encodeURIComponent(month)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load'))))
      .then((res: AlertsApiResponse) => setPayload(res))
      .catch(() => {
        setPayload(null);
        setError(true);
      })
      .finally(() => setLoading(false));
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  const grouped = useMemo(
    () => (payload?.alerts ? groupAlertsByBoutique(payload.alerts) : []),
    [payload]
  );

  const contextLine =
    payload &&
    interpolateLabel(t('companyBackoffice.alertsContext'), {
      monthKey: payload.monthKey,
      daysPassed: payload.daysPassed,
      daysInMonth: payload.daysInMonth,
    });

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-6 px-3 py-6 md:px-6">
      <CompanyPageHeader
        title={t('companyBackoffice.alertsTitle')}
        description={t('companyBackoffice.subtitle')}
        month={month}
        onMonthChange={setMonth}
        contextLine={contextLine || undefined}
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

      {!loading && !error && payload && (
        <OpsCard>
          <p className="mb-4 text-sm text-muted-foreground">{t('companyBackoffice.alertsGroupedHint')}</p>
          {payload.alerts.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('companyBackoffice.noAlerts')}</p>
          ) : (
            <div className="flex flex-col gap-6">
              {grouped.map(([boutiqueId, items]) => (
                <section
                  key={boutiqueId}
                  className="rounded-xl border border-border bg-background/40 p-4"
                >
                  <h3 className="text-base font-semibold text-foreground">
                    {items[0]?.boutiqueName}{' '}
                    <span className="font-normal text-muted-foreground">
                      ({items[0]?.boutiqueCode})
                    </span>
                  </h3>
                  <ul className="mt-3 space-y-3">
                    {items.map((a, i) => (
                      <li
                        key={`${a.kind}-${boutiqueId}-${i}`}
                        className="flex flex-col gap-2 rounded-lg border border-border/80 bg-surface px-3 py-3 sm:flex-row sm:items-start sm:gap-3"
                      >
                        <CompanyAlertLevelBadge level={a.level} />
                        <p className="min-w-0 flex-1 text-sm leading-relaxed text-foreground">
                          {formatCompanyAlertMessage(t(`companyBackoffice.alertsMeta.${a.kind}`), a)}
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </OpsCard>
      )}
    </div>
  );
}
