'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useT } from '@/lib/i18n/useT';
import { formatSarInt } from '@/lib/utils/money';
import { getRiyadhNow, toRiyadhDateString } from '@/lib/time';
import {
  PageContainer,
  SectionBlock,
  KPIGrid,
  KPIStatCard,
  EmptyStateBlock,
} from '@/components/ui/ExecutiveIntelligence';
import { PerformanceLineChart } from '@/components/dashboard/PerformanceLineChart';
import { ChartCard } from '@/components/ui/ChartCard';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { AnalyticsMiniBars } from '@/components/sales-analytics/AnalyticsMiniBars';
import { VisualComparisonSection } from '@/components/sales-analytics/VisualComparisonSection';
import type { SalesAnalyticsPayload } from '@/lib/sales-analytics/types';
import { comparisonRowLabelKeys, comparisonTitleKey, formatComparisonAmounts } from '@/lib/sales-analytics/comparisonLabels';
import { dataTableCellNumeric, dataTableTd, dataTableTh, dataTableTheadTr } from '@/lib/ui-styles';

type BoutiqueOption = { id: string; code: string; name: string };

function formatYmdDisplay(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return ymd;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function ComparisonCard({
  title,
  currentLabel,
  refLabel,
  currentFmt,
  refFmt,
  deltaFmt,
  deltaPctFmt,
  signal,
  t,
}: {
  title: string;
  currentLabel: string;
  refLabel: string;
  currentFmt: string;
  refFmt: string;
  deltaFmt: string;
  deltaPctFmt: string;
  signal: 'good' | 'warning' | 'risk';
  t: (k: string) => string;
}) {
  const sigLabel =
    signal === 'good' ? t('salesAnalytics.signalGood') : signal === 'risk' ? t('salesAnalytics.signalRisk') : t('salesAnalytics.signalWatch');
  return (
    <article className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <dl className="mt-3 grid gap-2 text-sm">
        <div className="flex justify-between gap-2">
          <dt className="text-muted">{currentLabel}</dt>
          <dd className="font-medium tabular-nums text-foreground">{currentFmt}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted">{refLabel}</dt>
          <dd className="font-medium tabular-nums text-foreground">{refFmt}</dd>
        </div>
        <div className="flex justify-between gap-2 border-t border-border/60 pt-2">
          <dt className="text-muted">{t('salesAnalytics.delta')}</dt>
          <dd className="font-medium tabular-nums text-foreground">{deltaFmt}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted">{t('salesAnalytics.deltaPct')}</dt>
          <dd className="font-medium tabular-nums text-foreground">{deltaPctFmt}</dd>
        </div>
        <div className="pt-1">
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
              signal === 'good'
                ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200'
                : signal === 'risk'
                  ? 'bg-rose-50 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200'
                  : 'bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200'
            }`}
          >
            {sigLabel}
          </span>
        </div>
      </dl>
    </article>
  );
}

function RankTable({
  title,
  rows,
  t,
}: {
  title: string;
  rows: SalesAnalyticsPayload['branches']['top'];
  t: (k: string) => string;
}) {
  if (!rows.length) {
    return (
      <div className="rounded-xl border border-border bg-surface/50 p-4">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="mt-2 text-sm text-muted">{t('salesAnalytics.emptyRank')}</p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[480px] border-collapse text-sm">
          <thead>
            <tr className={dataTableTheadTr}>
              <th className={dataTableTh}>#</th>
              <th className={dataTableTh}>{t('salesAnalytics.colName')}</th>
              <th className={`${dataTableTh} text-end`}>{t('salesAnalytics.colSales')}</th>
              <th className={`${dataTableTh} text-end`}>{t('salesAnalytics.colTarget')}</th>
              <th className={`${dataTableTh} text-end`}>{t('salesAnalytics.colAch')}</th>
              <th className={`${dataTableTh} text-end`}>{t('salesAnalytics.colContrib')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border/50 last:border-0">
                <td className={dataTableTd}>{r.rank}</td>
                <td className={dataTableTd}>{r.name}</td>
                <td className={`${dataTableTd} ${dataTableCellNumeric}`}>{formatSarInt(r.sales)}</td>
                <td className={`${dataTableTd} ${dataTableCellNumeric}`}>{formatSarInt(r.target)}</td>
                <td className={`${dataTableTd} ${dataTableCellNumeric}`}>{r.achPct}%</td>
                <td className={`${dataTableTd} ${dataTableCellNumeric}`}>{r.contributionPct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function SalesAnalyticsClient() {
  const { t } = useT();
  const searchParams = useSearchParams();
  const router = useRouter();
  const defaultAsOf = useMemo(() => toRiyadhDateString(getRiyadhNow()), []);

  const [asOf, setAsOf] = useState(() => searchParams.get('asOf')?.trim() || defaultAsOf);
  const [boutiqueId, setBoutiqueId] = useState(() => searchParams.get('boutiqueId')?.trim() || '');
  const [allowedBoutiques, setAllowedBoutiques] = useState<BoutiqueOption[]>([]);
  const [operationalBoutique, setOperationalBoutique] = useState<{ boutiqueId: string; label: string } | null>(null);
  const [scopeReady, setScopeReady] = useState(false);
  const [data, setData] = useState<SalesAnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [opRes, listRes] = await Promise.all([
        fetch('/api/me/operational-boutique', { cache: 'no-store' }),
        fetch('/api/me/boutiques', { cache: 'no-store' }),
      ]);
      if (cancelled) return;
      const op = opRes.ok ? await opRes.json() : null;
      const list = listRes.ok ? await listRes.json() : null;
      const boutiques: BoutiqueOption[] = list?.boutiques ?? [];
      const defaultId = op?.boutiqueId ?? boutiques[0]?.id ?? '';
      setOperationalBoutique(defaultId ? { boutiqueId: defaultId, label: op?.label ?? '' } : null);
      setAllowedBoutiques(boutiques);
      setScopeReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!scopeReady || allowedBoutiques.length === 0) return;
    const defaultId = operationalBoutique?.boutiqueId ?? allowedBoutiques[0]?.id ?? '';
    setBoutiqueId((prev) => {
      if (prev && allowedBoutiques.some((b) => b.id === prev)) return prev;
      return defaultId;
    });
  }, [scopeReady, operationalBoutique?.boutiqueId, allowedBoutiques]);

  useEffect(() => {
    if (!scopeReady) return;
    const params = new URLSearchParams(searchParams.toString());
    if (asOf) params.set('asOf', asOf);
    else params.delete('asOf');
    if (boutiqueId) params.set('boutiqueId', boutiqueId);
    else params.delete('boutiqueId');
    const qs = params.toString();
    const cur = searchParams.toString();
    if (qs !== cur) router.replace(qs ? `/sales/analytics?${qs}` : '/sales/analytics', { scroll: false });
  }, [scopeReady, asOf, boutiqueId, router, searchParams]);

  const load = useCallback(async () => {
    if (!boutiqueId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ asOf });
      params.set('boutiqueId', boutiqueId);
      const res = await fetch(`/api/sales/analytics?${params}`, { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((json as { error?: string }).error ?? t('salesAnalytics.loadError'));
        setData(null);
        return;
      }
      setData(json as SalesAnalyticsPayload);
    } catch {
      setError(t('salesAnalytics.loadError'));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [asOf, boutiqueId, t]);

  useEffect(() => {
    if (scopeReady && boutiqueId) load();
  }, [scopeReady, boutiqueId, load]);

  const boutiqueOptions = useMemo(() => {
    if (allowedBoutiques.length === 0) return [{ value: '', label: '—' }];
    return allowedBoutiques.map((b) => ({
      value: b.id,
      label: `${b.name} (${b.code})`,
    }));
  }, [allowedBoutiques]);

  const chartData = useMemo(() => {
    const traj = data?.dailyTrajectory ?? [];
    return traj.map((d) => ({
      label: d.dateKey.slice(-2),
      value: d.actualCumulative,
    }));
  }, [data?.dailyTrajectory]);

  const chartTargetLine = useMemo(() => {
    return (data?.dailyTrajectory ?? []).map((d) => d.targetCumulative);
  }, [data?.dailyTrajectory]);

  if (!scopeReady) {
    return (
      <PageContainer className="mx-auto max-w-7xl">
        <p className="text-sm text-muted">{t('salesAnalytics.loadingScope')}</p>
      </PageContainer>
    );
  }

  return (
    <PageContainer className="mx-auto max-w-7xl space-y-8 md:space-y-10">
      <SectionBlock
        title={t('salesAnalytics.title')}
        subtitle={t('salesAnalytics.subtitle')}
        rightSlot={
          <span className="rounded-full border border-border bg-surface-subtle px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-muted">
            {t('salesAnalytics.badgeProduction')}
          </span>
        }
      >
        <div className="flex flex-col gap-4 md:flex-row md:flex-wrap md:items-end">
          <Input
            type="date"
            label={t('salesAnalytics.asOfLabel')}
            value={asOf}
            max={defaultAsOf}
            onChange={(e) => setAsOf(e.target.value)}
            className="min-w-[10rem] max-w-xs"
          />
          <Select
            label={t('salesAnalytics.boutiqueLabel')}
            value={boutiqueId}
            onChange={(e) => setBoutiqueId(e.target.value)}
            disabled={allowedBoutiques.length <= 1}
            options={boutiqueOptions}
            className="min-w-[12rem] max-w-md"
          />
          <Button type="button" variant="secondary" onClick={() => load()} disabled={loading || !boutiqueId}>
            {loading ? t('salesAnalytics.refreshing') : t('salesAnalytics.refresh')}
          </Button>
        </div>
      </SectionBlock>

      {error ? (
        <EmptyStateBlock title={t('salesAnalytics.errorTitle')} description={error} />
      ) : null}

      {loading && !data ? <p className="text-sm text-muted">{t('salesAnalytics.loadingData')}</p> : null}

      {!loading && !error && !data && boutiqueId ? (
        <EmptyStateBlock title={t('salesAnalytics.emptyTitle')} description={t('salesAnalytics.emptyDesc')} />
      ) : null}

      {data ? (
        <>
          <p className="mb-4 text-sm text-muted">
            {t('salesAnalytics.viewingLine')
              .replace('{boutique}', data.boutiqueName)
              .replace('{code}', data.boutiqueCode)
              .replace('{date}', formatYmdDisplay(data.asOf))}
          </p>

          <SectionBlock title={t('salesAnalytics.kpiTitle')}>
            <KPIGrid>
              <KPIStatCard title={t('salesAnalytics.kpiToday')} value={formatSarInt(data.kpis.todaySales)} tone="default" />
              <KPIStatCard title={t('salesAnalytics.kpiDailyTarget')} value={formatSarInt(data.kpis.dailyTargetSar)} tone="default" />
              <KPIStatCard
                title={t('salesAnalytics.kpiDailyAch')}
                value={`${data.kpis.dailyAchPct}%`}
                tone={data.kpis.dailyAchPct >= 100 ? 'success' : data.kpis.dailyAchPct >= 80 ? 'default' : 'warning'}
                subtitle={t('salesAnalytics.vsDailyAlloc')}
              />
              <KPIStatCard title={t('salesAnalytics.kpiMtdSales')} value={formatSarInt(data.kpis.mtdSales)} tone="default" />
              <KPIStatCard title={t('salesAnalytics.kpiMtdTarget')} value={formatSarInt(data.kpis.mtdTargetSar)} tone="default" />
              <KPIStatCard
                title={t('salesAnalytics.kpiMtdAch')}
                value={`${data.kpis.mtdAchPct}%`}
                tone={data.kpis.mtdAchPct >= 100 ? 'success' : data.kpis.mtdAchPct >= 90 ? 'default' : 'warning'}
              />
              <KPIStatCard
                title={t('salesAnalytics.kpiRemaining')}
                value={formatSarInt(Math.max(0, data.kpis.remainingSar))}
                tone={data.kpis.remainingSar > 0 ? 'warning' : 'success'}
              />
              <KPIStatCard
                title={t('salesAnalytics.kpiReqPace')}
                value={formatSarInt(data.kpis.requiredDailyPaceSar)}
                subtitle={t('salesAnalytics.reqPaceHint')}
              />
              <KPIStatCard
                title={t('salesAnalytics.kpiForecast')}
                value={formatSarInt(data.kpis.forecastEomSar)}
                subtitle={t('salesAnalytics.linearRunRate')}
              />
            </KPIGrid>
          </SectionBlock>

          <SectionBlock title={t('salesAnalytics.compareTitle')}>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {data.comparisons.map((c) => {
                const row = comparisonRowLabelKeys(c.id);
                const amounts = formatComparisonAmounts(c);
                return (
                  <ComparisonCard
                    key={c.id}
                    title={t(comparisonTitleKey(c.id))}
                    currentLabel={t(row.currentKey)}
                    refLabel={t(row.refKey)}
                    currentFmt={amounts.currentFmt}
                    refFmt={amounts.refFmt}
                    deltaFmt={amounts.deltaFmt}
                    deltaPctFmt={amounts.deltaPctFmt}
                    signal={c.signal}
                    t={t}
                  />
                );
              })}
            </div>
          </SectionBlock>

          <div className="grid gap-6 lg:grid-cols-2">
            <RankTable title={t('salesAnalytics.topBranches')} rows={data.branches.top} t={t} />
            <RankTable title={t('salesAnalytics.lowBranches')} rows={data.branches.low} t={t} />
            <RankTable title={t('salesAnalytics.topEmployees')} rows={data.employees.top} t={t} />
            <RankTable title={t('salesAnalytics.lowEmployees')} rows={data.employees.low} t={t} />
          </div>

          <SectionBlock title={t('salesAnalytics.chartsTitle')}>
            <VisualComparisonSection comparisons={data.comparisons} kpis={data.kpis} t={t} />
            <div className="grid gap-6 lg:grid-cols-2">
              <ChartCard
                title={t('salesAnalytics.chartTrajectory')}
                subtitle={t('salesAnalytics.chartTrajectoryHint')}
                className="lg:col-span-2"
              >
                {chartData.length > 0 ? (
                  <PerformanceLineChart
                    data={chartData}
                    targetLine={chartTargetLine}
                    height={260}
                    valueFormat={(n) => formatSarInt(n)}
                    emptyLabel={t('salesAnalytics.chartEmpty')}
                  />
                ) : (
                  <p className="text-sm text-muted">{t('salesAnalytics.chartEmpty')}</p>
                )}
              </ChartCard>
              <ChartCard title={t('salesAnalytics.chartEmployees')} className="lg:col-span-2">
                <AnalyticsMiniBars items={data.employeeBars} emptyLabel={t('salesAnalytics.chartEmpty')} />
              </ChartCard>
            </div>
          </SectionBlock>

          <SectionBlock title={t('salesAnalytics.insightsTitle')}>
            <ul className="list-disc space-y-2 pl-5 text-sm text-foreground/90">
              {data.insights.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </SectionBlock>
        </>
      ) : null}
    </PageContainer>
  );
}
