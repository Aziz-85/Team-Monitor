'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useT } from '@/lib/i18n/useT';
import { getRiyadhDateKey } from '@/lib/dates/riyadhDate';
import { formatSarInt } from '@/lib/utils/money';
import {
  PageContainer,
  SectionBlock,
  KPIGrid,
  KPIStatCard,
  InsightGrid,
  InsightCard,
  RecommendationCard,
  EmptyStateBlock,
} from '@/components/ui/ExecutiveIntelligence';
import { PerformanceLineChart } from '@/components/dashboard/PerformanceLineChart';
import { ChartCard } from '@/components/ui/ChartCard';
import { Button } from '@/components/ui/Button';
import { SalesTestMiniBars } from '@/components/test-sales/SalesTestMiniBars';
import {
  averageBasketSize,
  basicForecastEndOfMonth,
  buildInsightLines,
  conversionRate,
  dailyAchievementPct,
  deltaAndPct,
  expectedMtdLinear,
  monthContextFromDateKey,
  mtdAchievementPct,
  rankLines,
  remainingToTarget,
  requiredDailyPace,
  signalFromDeltaPct,
} from '@/lib/test-sales/calculations';
import { dataTableCellNumeric, dataTableTd, dataTableTh, dataTableTheadTr } from '@/lib/ui-styles';

export type SalesTestEntryPayload = {
  id: string;
  dateKey: string;
  boutiqueId: string | null;
  boutiqueLabel: string | null;
  todaySalesSar: number;
  dailyTargetSar: number;
  mtdSalesSar: number;
  mtdTargetSar: number;
  visitors: number | null;
  transactions: number | null;
  stockAvailabilityPct: number | null;
  campaignActive: boolean;
  campaignNotes: string | null;
  yesterdaySalesSar: number | null;
  sameDayLastWeekSalesSar: number | null;
  lastMonthMtdSalesSar: number | null;
  timePatternNote: string | null;
  promotionImpactNote: string | null;
  monthTrendJson: string | null;
  employees: Array<{ name: string; salesSar: number; targetSar: number }>;
  branches: Array<{ branchLabel: string; salesSar: number; targetSar: number }>;
};

function ComparisonRow({
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
  signal: ReturnType<typeof signalFromDeltaPct>;
  t: (k: string) => string;
}) {
  const sigLabel =
    signal === 'good' ? t('testSales.signalGood') : signal === 'risk' ? t('testSales.signalRisk') : t('testSales.signalWarning');
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
          <dt className="text-muted">{t('testSales.compareDelta')}</dt>
          <dd className="font-medium tabular-nums text-foreground">{deltaFmt}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted">{t('testSales.compareDeltaPct')}</dt>
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

export function SalesTestDashboardClient({ initialDateKey }: { initialDateKey?: string | null } = {}) {
  const { t } = useT();
  const [dateKey, setDateKey] = useState(
    () => (initialDateKey && initialDateKey.trim() ? initialDateKey.trim() : getRiyadhDateKey())
  );
  const [entry, setEntry] = useState<SalesTestEntryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/test-sales/entry?dateKey=${encodeURIComponent(dateKey)}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((json as { error?: string }).error ?? t('testSales.loadEntryError'));
        setEntry(null);
        return;
      }
      setEntry((json as { entry: SalesTestEntryPayload | null }).entry ?? null);
    } catch {
      setError(t('testSales.loadEntryError'));
      setEntry(null);
    } finally {
      setLoading(false);
    }
  }, [dateKey, t]);

  useEffect(() => {
    load();
  }, [load]);

  const ctx = useMemo(() => (entry ? monthContextFromDateKey(entry.dateKey) : monthContextFromDateKey(dateKey)), [entry, dateKey]);
  const calc = useMemo(() => {
    if (!entry || !ctx) return null;
    const dailyAch = dailyAchievementPct(entry.todaySalesSar, entry.dailyTargetSar);
    const mtdAch = mtdAchievementPct(entry.mtdSalesSar, entry.mtdTargetSar);
    const rem = remainingToTarget(entry.mtdSalesSar, entry.mtdTargetSar);
    const pace = requiredDailyPace(entry.mtdSalesSar, entry.mtdTargetSar, ctx.remainingDaysIncludingToday);
    const forecast = basicForecastEndOfMonth(entry.mtdSalesSar, ctx.elapsedDays, ctx.totalDaysInMonth);
    const expected = expectedMtdLinear(entry.mtdTargetSar, ctx.elapsedDays, ctx.totalDaysInMonth);
    const basket = averageBasketSize(entry.todaySalesSar, entry.transactions);
    const conv = conversionRate(entry.transactions, entry.visitors);
    const { delta: dY, deltaPct: pctY } = deltaAndPct(entry.todaySalesSar, entry.yesterdaySalesSar);
    const { delta: dW, deltaPct: pctW } = deltaAndPct(entry.todaySalesSar, entry.sameDayLastWeekSalesSar);
    const { delta: dM, deltaPct: pctM } = deltaAndPct(entry.mtdSalesSar, entry.lastMonthMtdSalesSar);
    const { delta: dT, deltaPct: pctT } = deltaAndPct(entry.mtdSalesSar, entry.mtdTargetSar);
    const expVal = expected ?? 0;
    const { delta: dP, deltaPct: pctP } = deltaAndPct(entry.mtdSalesSar, expVal);
    const branchRank = rankLines(
      entry.branches.map((b) => ({ name: b.branchLabel, salesSar: b.salesSar, targetSar: b.targetSar })),
      entry.branches.reduce((s, b) => s + b.salesSar, 0) || entry.todaySalesSar
    );
    const empRank = rankLines(
      entry.employees.map((e) => ({ name: e.name, salesSar: e.salesSar, targetSar: e.targetSar })),
      entry.employees.reduce((s, e) => s + e.salesSar, 0) || entry.todaySalesSar
    );
    const insightLines = buildInsightLines({
      dailyAchPct: dailyAch,
      mtdAchPct: mtdAch,
      reqPace: pace,
      remToTarget: rem,
      conv,
      basket,
      visitors: entry.visitors,
      transactions: entry.transactions,
      todayVsYesterdayDeltaPct: pctY,
      forecast: forecast,
      mtdTarget: entry.mtdTargetSar,
    });
    let trendPoints: { label: string; value: number; tgt?: number | null }[] = [];
    let targetLine: number[] | undefined;
    try {
      const raw = entry.monthTrendJson ? JSON.parse(entry.monthTrendJson) : [];
      if (Array.isArray(raw)) {
        trendPoints = raw
          .map((p: unknown) => {
            const o = p as Record<string, unknown>;
            const label = typeof o.label === 'string' ? o.label : String(o.label ?? '');
            const sales = Number(o.sales);
            const target = o.target != null ? Number(o.target) : NaN;
            return {
              label,
              value: Number.isFinite(sales) ? Math.trunc(sales) : 0,
              tgt: Number.isFinite(target) ? Math.trunc(target) : null,
            };
          })
          .filter((p) => p.label);
        if (trendPoints.length && trendPoints.every((p) => p.tgt != null)) {
          targetLine = trendPoints.map((p) => p.tgt as number);
        }
      }
    } catch {
      trendPoints = [];
    }
    const chartData = trendPoints.map(({ label, value }) => ({ label, value }));
    const branchBarItems = entry.branches.map((b) => ({
      label: b.branchLabel,
      value: b.salesSar,
      max: Math.max(b.salesSar, b.targetSar, 1),
    }));
    const empBarItems = entry.employees.map((e) => ({
      label: e.name,
      value: e.salesSar,
      max: Math.max(e.salesSar, e.targetSar, 1),
    }));
    return {
      dailyAch,
      mtdAch,
      rem,
      pace,
      forecast,
      expected,
      basket,
      conv,
      dY,
      pctY,
      dW,
      pctW,
      dM,
      pctM,
      dT,
      pctT,
      dP,
      pctP,
      branchRank,
      empRank,
      insightLines,
      chartData,
      targetLine,
      branchBarItems,
      empBarItems,
    };
  }, [entry, ctx]);

  if (loading) {
    return (
      <PageContainer>
        <p className="text-sm text-muted">{t('common.loading')}</p>
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer>
        <EmptyStateBlock title={t('common.failed')} description={error} />
        <Button type="button" variant="secondary" className="mt-4" onClick={load}>
          {t('testSales.refresh')}
        </Button>
      </PageContainer>
    );
  }

  if (!entry || !calc || !ctx) {
    return (
      <PageContainer>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <span className="inline-flex items-center rounded-full border border-amber-300/80 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
              {t('testSales.badge')}
            </span>
            <h1 className="mt-2 text-xl font-semibold text-foreground md:text-2xl">{t('testSales.dashboardTitle')}</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted">{t('testSales.dashboardSubtitle')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm text-muted">{t('testSales.dateLabel')}</label>
            <input
              type="date"
              value={dateKey}
              onChange={(e) => setDateKey(e.target.value)}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm shadow-sm"
            />
            <Link href={`/test/sales-input?dateKey=${encodeURIComponent(dateKey)}`}>
              <Button type="button" variant="secondary" className="h-9 text-sm">
                {t('testSales.openInput')}
              </Button>
            </Link>
          </div>
        </div>
        <EmptyStateBlock title={t('testSales.emptyTitle')} description={t('testSales.emptyDesc')} />
        <div className="mt-4">
          <Link href={`/test/sales-input?dateKey=${encodeURIComponent(dateKey)}`}>
            <Button type="button" variant="primary" className="text-sm">
              {t('testSales.openInput')}
            </Button>
          </Link>
        </div>
      </PageContainer>
    );
  }

  const c = calc;

  return (
    <PageContainer>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-border/70 pb-4">
        <div>
          <span className="inline-flex items-center rounded-full border border-amber-300/80 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
            {t('testSales.badge')}
          </span>
          <h1 className="mt-2 text-xl font-semibold text-foreground md:text-2xl">{t('testSales.dashboardTitle')}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">{t('testSales.dashboardSubtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm text-muted">{t('testSales.dateLabel')}</label>
          <input
            type="date"
            value={dateKey}
            onChange={(e) => setDateKey(e.target.value)}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm shadow-sm"
          />
          <Button type="button" variant="secondary" className="h-9 text-sm" onClick={load}>
            {t('testSales.refresh')}
          </Button>
          <Link href={`/test/sales-input?dateKey=${encodeURIComponent(dateKey)}`}>
            <Button type="button" variant="secondary" className="h-9 text-sm">
              {t('testSales.openInput')}
            </Button>
          </Link>
        </div>
      </div>

      <p className="mb-2 text-xs text-muted">
        {entry.boutiqueLabel || entry.boutiqueId
          ? `${entry.boutiqueLabel ?? t('testSales.boutiqueLabel')} · ${entry.dateKey}`
          : entry.dateKey}
      </p>

      <SectionBlock title={t('testSales.kpisTitle')}>
        <KPIGrid cols={3} className="lg:grid-cols-3 xl:grid-cols-3">
          <KPIStatCard
            title={t('testSales.kpiTodaySales')}
            value={formatSarInt(entry.todaySalesSar)}
            tone="default"
            supportLabel={t('testSales.sales')}
          />
          <KPIStatCard title={t('testSales.kpiDailyTarget')} value={formatSarInt(entry.dailyTargetSar)} tone="default" />
          <KPIStatCard
            title={t('testSales.kpiDailyAch')}
            value={c.dailyAch != null ? `${c.dailyAch}%` : '—'}
            tone={c.dailyAch != null && c.dailyAch >= 100 ? 'success' : c.dailyAch != null && c.dailyAch < 85 ? 'danger' : 'warning'}
          />
          <KPIStatCard title={t('testSales.kpiMtdSales')} value={formatSarInt(entry.mtdSalesSar)} tone="default" />
          <KPIStatCard title={t('testSales.kpiMtdTarget')} value={formatSarInt(entry.mtdTargetSar)} tone="default" />
          <KPIStatCard
            title={t('testSales.kpiMtdAch')}
            value={c.mtdAch != null ? `${c.mtdAch}%` : '—'}
            tone={c.mtdAch != null && c.mtdAch >= 100 ? 'success' : c.mtdAch != null && c.mtdAch < 85 ? 'danger' : 'warning'}
          />
          <KPIStatCard
            title={t('testSales.kpiRemaining')}
            value={formatSarInt(Math.max(0, c.rem))}
            tone={c.rem > 0 ? 'warning' : 'success'}
          />
          <KPIStatCard
            title={t('testSales.kpiReqPace')}
            value={c.pace != null ? formatSarInt(c.pace) : '—'}
            tone="default"
            subtitle={t('testSales.reqPace')}
          />
          <KPIStatCard
            title={t('testSales.kpiForecastEom')}
            value={c.forecast != null ? formatSarInt(c.forecast) : '—'}
            tone="default"
          />
        </KPIGrid>
      </SectionBlock>

      <SectionBlock title={t('testSales.compareTitle')}>
        <InsightGrid>
          <ComparisonRow
            title={t('testSales.compareTodayVsYesterday')}
            currentLabel={t('testSales.sales')}
            refLabel={t('testSales.compareRef')}
            currentFmt={formatSarInt(entry.todaySalesSar)}
            refFmt={entry.yesterdaySalesSar != null ? formatSarInt(entry.yesterdaySalesSar) : '—'}
            deltaFmt={c.dY != null ? formatSarInt(c.dY) : '—'}
            deltaPctFmt={c.pctY != null ? `${c.pctY >= 0 ? '+' : ''}${c.pctY}%` : '—'}
            signal={signalFromDeltaPct(c.pctY)}
            t={t}
          />
          <ComparisonRow
            title={t('testSales.compareTodayVsWeekAgo')}
            currentLabel={t('testSales.sales')}
            refLabel={t('testSales.compareRef')}
            currentFmt={formatSarInt(entry.todaySalesSar)}
            refFmt={entry.sameDayLastWeekSalesSar != null ? formatSarInt(entry.sameDayLastWeekSalesSar) : '—'}
            deltaFmt={c.dW != null ? formatSarInt(c.dW) : '—'}
            deltaPctFmt={c.pctW != null ? `${c.pctW >= 0 ? '+' : ''}${c.pctW}%` : '—'}
            signal={signalFromDeltaPct(c.pctW)}
            t={t}
          />
          <ComparisonRow
            title={t('testSales.compareMtdVsLastMonth')}
            currentLabel={t('testSales.sales')}
            refLabel={t('testSales.compareRef')}
            currentFmt={formatSarInt(entry.mtdSalesSar)}
            refFmt={entry.lastMonthMtdSalesSar != null ? formatSarInt(entry.lastMonthMtdSalesSar) : '—'}
            deltaFmt={c.dM != null ? formatSarInt(c.dM) : '—'}
            deltaPctFmt={c.pctM != null ? `${c.pctM >= 0 ? '+' : ''}${c.pctM}%` : '—'}
            signal={signalFromDeltaPct(c.pctM)}
            t={t}
          />
          <ComparisonRow
            title={t('testSales.compareActualVsTarget')}
            currentLabel={t('testSales.sales')}
            refLabel={t('testSales.target')}
            currentFmt={formatSarInt(entry.mtdSalesSar)}
            refFmt={formatSarInt(entry.mtdTargetSar)}
            deltaFmt={c.dT != null ? formatSarInt(c.dT) : '—'}
            deltaPctFmt={c.pctT != null ? `${c.pctT >= 0 ? '+' : ''}${c.pctT}%` : '—'}
            signal={signalFromDeltaPct(c.pctT)}
            t={t}
          />
          <ComparisonRow
            title={t('testSales.compareActualVsPace')}
            currentLabel={t('testSales.sales')}
            refLabel={t('testSales.compareRef')}
            currentFmt={formatSarInt(entry.mtdSalesSar)}
            refFmt={c.expected != null ? formatSarInt(c.expected) : '—'}
            deltaFmt={c.dP != null ? formatSarInt(c.dP) : '—'}
            deltaPctFmt={c.pctP != null ? `${c.pctP >= 0 ? '+' : ''}${c.pctP}%` : '—'}
            signal={signalFromDeltaPct(c.pctP)}
            t={t}
          />
        </InsightGrid>
      </SectionBlock>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionBlock title={`${t('testSales.topLabel')} · ${t('testSales.branchesTitle')}`}>
          <RankTable rows={c.branchRank.top} t={t} />
        </SectionBlock>
        <SectionBlock title={`${t('testSales.lowLabel')} · ${t('testSales.branchesTitle')}`}>
          <RankTable rows={c.branchRank.low} t={t} />
        </SectionBlock>
        <SectionBlock title={`${t('testSales.topLabel')} · ${t('testSales.employeesTitle')}`}>
          <RankTable rows={c.empRank.top} nameKey="name" t={t} />
        </SectionBlock>
        <SectionBlock title={`${t('testSales.lowLabel')} · ${t('testSales.employeesTitle')}`}>
          <RankTable rows={c.empRank.low} nameKey="name" t={t} />
        </SectionBlock>
      </div>

      <SectionBlock title={t('testSales.driversTitle')}>
        <InsightGrid>
          <InsightCard
            title={t('testSales.footfall')}
            description={
              entry.visitors != null ? `${entry.visitors.toLocaleString()}` : t('testSales.notEntered')
            }
            tone="default"
          />
          <InsightCard
            title={t('testSales.transactions')}
            description={
              entry.transactions != null ? `${entry.transactions.toLocaleString()}` : t('testSales.notEntered')
            }
            tone="default"
          />
          <InsightCard
            title={t('testSales.basket')}
            description={c.basket != null ? formatSarInt(c.basket) : t('testSales.notEntered')}
            tone="default"
          />
          <InsightCard
            title={t('testSales.conversionLbl')}
            description={c.conv != null ? `${c.conv}%` : t('testSales.notEntered')}
            tone={c.conv != null && c.conv < 25 ? 'warning' : 'default'}
          />
          <InsightCard
            title={t('testSales.stockAvail')}
            description={
              entry.stockAvailabilityPct != null ? `${entry.stockAvailabilityPct}%` : t('testSales.notEntered')
            }
            tone="default"
          />
          <InsightCard
            title={t('testSales.campaign')}
            description={
              entry.campaignActive ? t('testSales.campaignActive') : t('testSales.campaignInactive')
            }
            footer={entry.campaignNotes ?? undefined}
            tone="info"
          />
          <InsightCard
            title={t('testSales.promotionImpact')}
            description={entry.promotionImpactNote?.trim() || t('testSales.notEntered')}
            tone="default"
          />
          <InsightCard
            title={t('testSales.timePattern')}
            description={entry.timePatternNote?.trim() || t('testSales.notEntered')}
            tone="default"
          />
        </InsightGrid>
      </SectionBlock>

      <SectionBlock title={t('testSales.insightsTitle')}>
        <RecommendationCard title={t('testSales.insightsTitle')} message={c.insightLines.join(' ')} tone="info" />
      </SectionBlock>

      <SectionBlock title={t('testSales.chartsTitle')}>
        <div className="grid gap-6 lg:grid-cols-2">
          <ChartCard title={t('testSales.chartDailyTrend')} subtitle={t('testSales.formMonthTrendHint')}>
            {c.chartData.length > 0 ? (
              <PerformanceLineChart
                data={c.chartData}
                targetLine={c.targetLine}
                height={240}
                valueFormat={(n) => formatSarInt(n)}
                emptyLabel={t('testSales.noChartData')}
              />
            ) : (
              <p className="text-sm text-muted">{t('testSales.noChartData')}</p>
            )}
          </ChartCard>
          <ChartCard title={t('testSales.chartBranchBars')}>
            <SalesTestMiniBars items={c.branchBarItems} emptyLabel={t('testSales.noChartData')} />
          </ChartCard>
          <ChartCard title={t('testSales.chartEmployeeBars')} className="lg:col-span-2">
            <SalesTestMiniBars items={c.empBarItems} emptyLabel={t('testSales.noChartData')} />
          </ChartCard>
        </div>
      </SectionBlock>
    </PageContainer>
  );
}

function RankTable({
  rows,
  nameKey = 'name',
  t,
}: {
  rows: Array<{ name: string; sales: number; target: number; achPct: number | null; contributionPct: number | null }>;
  nameKey?: string;
  t: (k: string) => string;
}) {
  void nameKey;
  if (!rows.length) {
    return <p className="text-sm text-muted">{t('testSales.noChartData')}</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[400px] border-collapse text-sm">
        <thead>
          <tr className={dataTableTheadTr}>
            <th className={dataTableTh}>{t('testSales.rank')}</th>
            <th className={dataTableTh}>{t('common.name')}</th>
            <th className={`${dataTableTh} text-end`}>{t('testSales.sales')}</th>
            <th className={`${dataTableTh} text-end`}>{t('testSales.target')}</th>
            <th className={`${dataTableTh} text-end`}>{t('testSales.ach')}</th>
            <th className={`${dataTableTh} text-end`}>{t('testSales.contrib')}</th>
          </tr>
        </thead>
        <tbody className="data-table-tbody bg-surface">
          {rows.map((r, i) => (
            <tr key={`${r.name}-${i}`} className="border-b border-border odd:bg-muted/20">
              <td className={dataTableTd}>{i + 1}</td>
              <td className={`${dataTableTd} max-w-[140px] truncate font-medium`} title={r.name}>
                {r.name}
              </td>
              <td className={`${dataTableTd} ${dataTableCellNumeric}`}>{formatSarInt(r.sales)}</td>
              <td className={`${dataTableTd} ${dataTableCellNumeric}`}>{formatSarInt(r.target)}</td>
              <td className={`${dataTableTd} ${dataTableCellNumeric}`}>
                {r.achPct != null ? `${r.achPct}%` : '—'}
              </td>
              <td className={`${dataTableTd} ${dataTableCellNumeric}`}>
                {r.contributionPct != null ? `${r.contributionPct}%` : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
