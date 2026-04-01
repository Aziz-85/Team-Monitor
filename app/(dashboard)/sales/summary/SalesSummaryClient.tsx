'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { formatSarInt } from '@/lib/utils/money';
import { useT } from '@/lib/i18n/useT';
import { FilterBar } from '@/components/ui/FilterBar';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import {
  DataTable,
  DataTableHead,
  DataTableTh,
  DataTableBody,
  DataTableTd,
} from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { TargetVsActualLineChart } from '@/components/charts/TargetVsActualLineChart';
import { PerformanceKpiCard } from '@/components/ui/PerformanceKpiCard';
import {
  EmptyStateBlock,
  InsightCard,
  InsightGrid,
  KPIGrid,
  KPIStatCard,
  PageContainer,
  RecommendationCard,
  SectionBlock,
} from '@/components/ui/ExecutiveIntelligence';
import { attentionSeverity, paceSignal } from '@/lib/presentation/executiveIntelligence';

type BoutiqueOption = { id: string; code: string; name: string };

const QUICK_PERIODS = [
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'quarter', label: 'Quarter' },
  { id: 'custom', label: 'Custom' },
] as const;

function getDateRangeForPeriod(periodId: string): { from: string; to: string } {
  const end = new Date();
  const start = new Date(end);
  if (periodId === 'week') start.setDate(start.getDate() - 7);
  else if (periodId === 'month') start.setDate(start.getDate() - 30);
  else if (periodId === 'quarter') start.setDate(start.getDate() - 90);
  else {
    start.setDate(start.getDate() - 30);
  }
  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
  };
}

function getDefaultDateRange(): { from: string; to: string } {
  return getDateRangeForPeriod('month');
}

type TargetsResponse = {
  week: { key: string; from?: string; to?: string; targetSar: number; achievedSar: number; remainingSar: number; pct: number };
  month: { key: string; targetSar: number; achievedSar: number; remainingSar: number; pct: number };
  quarter: { key: string; targetSar: number; achievedSar: number; remainingSar: number; pct: number };
  half: { key: string; targetSar: number; achievedSar: number; remainingSar: number; pct: number };
  year: { key: string; targetSar: number; achievedSar: number; remainingSar: number; pct: number };
  dailyTrajectory?: { dateKey: string; targetCumulative: number; actualCumulative: number }[];
  monthKey?: string;
};

type Summary = {
  from: string;
  to: string;
  netSalesTotal: number;
  grossSalesTotal: number;
  returnsTotal: number;
  exchangesTotal: number;
  guestCoverageNetSales: number;
  breakdownByEmployee: Array<{
    employeeId: string;
    employeeName: string;
    netSales: number;
    guestCoverageNetSales: number;
    guestCoverageSources: Array<{
      sourceBoutiqueId: string;
      sourceBoutiqueName?: string;
      netSales: number;
    }>;
  }>;
};

export function SalesSummaryClient() {
  const { t } = useT();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [boutiqueId, setBoutiqueId] = useState('');
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('month');
  const [operationalBoutique, setOperationalBoutique] = useState<{ boutiqueId: string; label: string } | null>(null);
  const [allowedBoutiques, setAllowedBoutiques] = useState<BoutiqueOption[]>([]);
  const [scopeReady, setScopeReady] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [targets, setTargets] = useState<TargetsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [targetsLoading, setTargetsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fromParam = searchParams.get('from')?.trim() || '';
    const toParam = searchParams.get('to')?.trim() || '';
    const boutiqueParam = searchParams.get('boutiqueId')?.trim() || '';
    if (fromParam) setFrom(fromParam);
    if (toParam) setTo(toParam);
    if (boutiqueParam) setBoutiqueId(boutiqueParam);
    if (fromParam || toParam) setSelectedPeriodId('custom');
  }, [searchParams]);

  useEffect(() => {
    if (from || to) return;
    const { from: defaultFrom, to: defaultTo } = getDefaultDateRange();
    setFrom(defaultFrom);
    setTo(defaultTo);
  }, [from, to]);

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
      const defaultLabel = op?.label ?? boutiques.find((b: BoutiqueOption) => b.id === defaultId)?.name ?? defaultId;
      setOperationalBoutique(defaultId ? { boutiqueId: defaultId, label: defaultLabel } : null);
      setAllowedBoutiques(boutiques);
      setScopeReady(true);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!scopeReady || allowedBoutiques.length === 0) return;
    const defaultId = operationalBoutique?.boutiqueId ?? allowedBoutiques[0]?.id ?? '';
    if (!defaultId) return;
    setBoutiqueId((prev) => {
      if (prev && allowedBoutiques.some((b) => b.id === prev)) return prev;
      return defaultId;
    });
  }, [scopeReady, operationalBoutique?.boutiqueId, allowedBoutiques]);

  useEffect(() => {
    if (!scopeReady) return;
    const params = new URLSearchParams(searchParams.toString());
    if (from) params.set('from', from);
    else params.delete('from');
    if (to) params.set('to', to);
    else params.delete('to');
    if (boutiqueId) params.set('boutiqueId', boutiqueId);
    else params.delete('boutiqueId');
    const qs = params.toString();
    const current = searchParams.toString();
    if (qs !== current) router.replace(qs ? `/sales/summary?${qs}` : '/sales/summary', { scroll: false });
  }, [scopeReady, from, to, boutiqueId, router, searchParams]);

  const load = useCallback(async () => {
    if (!from || !to) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ from, to });
      if (boutiqueId) params.set('boutiqueId', boutiqueId);
      const res = await fetch(`/api/sales/summary?${params}`, { cache: 'no-store' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? t('sales.summary.failedToLoad'));
        return;
      }
      const data = await res.json();
      setSummary(data);
    } finally {
      setLoading(false);
    }
  }, [from, to, boutiqueId, t]);

  const loadTargets = useCallback(async () => {
    if (!from || !to) return;
    setTargetsLoading(true);
    try {
      const params = new URLSearchParams({ from, to });
      if (boutiqueId) params.set('boutiqueId', boutiqueId);
      const res = await fetch(`/api/sales/summary/targets?${params}`, { cache: 'no-store' });
      if (!res.ok) {
        setTargets(null);
        return;
      }
      const data = await res.json();
      setTargets(data);
    } finally {
      setTargetsLoading(false);
    }
  }, [from, to, boutiqueId]);

  useEffect(() => {
    if (from && to && scopeReady) {
      load();
      loadTargets();
    }
  }, [from, to, boutiqueId, scopeReady, load, loadTargets]);

  const activeFilters: { label: string; value: string }[] = [];
  if (from && to) activeFilters.push({ label: 'From–To', value: `${from} – ${to}` });
  const selectedBoutique = allowedBoutiques.find((b) => b.id === boutiqueId);
  if (selectedBoutique) activeFilters.push({ label: t('sales.summary.boutique'), value: `${selectedBoutique.name} (${selectedBoutique.code})` });

  const handlePeriodSelect = useCallback((id: string) => {
    if (id === 'custom') {
      setSelectedPeriodId('custom');
      return;
    }
    const { from: f, to: t } = getDateRangeForPeriod(id);
    setFrom(f);
    setTo(t);
    setSelectedPeriodId(id);
  }, []);

  const handleReset = useCallback(() => {
    const { from: defaultFrom, to: defaultTo } = getDefaultDateRange();
    setFrom(defaultFrom);
    setTo(defaultTo);
    setSelectedPeriodId('month');
    const defaultId = operationalBoutique?.boutiqueId ?? allowedBoutiques[0]?.id ?? '';
    if (defaultId) setBoutiqueId(defaultId);
  }, [operationalBoutique?.boutiqueId, allowedBoutiques]);

  const summaryLine = from && to
    ? `Viewing ${selectedBoutique?.name ?? '—'} • ${from} → ${to}`
    : undefined;

  const boutiqueOptions = useMemo(() => {
    if (allowedBoutiques.length === 0) return [{ value: '', label: '—' }];
    return allowedBoutiques.map((b) => ({
      value: b.id,
      label: `${b.name} (${b.code})`,
    }));
  }, [allowedBoutiques]);

  const chartData = useMemo(() => {
    const traj = targets?.dailyTrajectory ?? [];
    return traj.map((d) => ({
      label: d.dateKey.slice(-2),
      value: d.actualCumulative,
    }));
  }, [targets?.dailyTrajectory]);

  const chartTargetLine = useMemo(() => {
    const traj = targets?.dailyTrajectory ?? [];
    return traj.map((d) => d.targetCumulative);
  }, [targets?.dailyTrajectory]);

  const monthPacePct = Math.max(0, Math.round(targets?.month.pct ?? 0));
  const monthPaceUi = paceSignal(monthPacePct);
  const paceToneForKpi = monthPaceUi.tone === 'success' ? 'default' : monthPaceUi.tone;
  const remainingTarget = targets?.month.remainingSar ?? 0;
  const remainingToneForKpi = remainingTarget > 0 ? (monthPaceUi.tone === 'danger' ? 'danger' : 'warning') : 'success';
  const dayCount = summary
    ? Math.max(1, Math.ceil((new Date(summary.to).getTime() - new Date(summary.from).getTime()) / (1000 * 60 * 60 * 24)) + 1)
    : 1;
  const avgDailyNet = summary ? Math.round(summary.netSalesTotal / dayCount) : 0;
  const activeEmployees = summary?.breakdownByEmployee.length ?? 0;
  const returnsAttentionCount = summary
    ? summary.grossSalesTotal > 0 && summary.returnsTotal / summary.grossSalesTotal >= 0.1
      ? 4
      : summary.returnsTotal > 0
        ? 2
        : 0
    : 0;
  const returnsUi = attentionSeverity(returnsAttentionCount, {
    none: t('sales.summary.executive.returnsControlled'),
    low: t('sales.summary.executive.returnsWatch'),
    high: t('sales.summary.executive.returnsRisk'),
    noneHint: t('sales.summary.executive.returnsControlledHint'),
    lowHint: t('sales.summary.executive.returnsWatchHint'),
    highHint: t('sales.summary.executive.returnsRiskHint'),
  });
  const sortedEmployees = useMemo(
    () => [...(summary?.breakdownByEmployee ?? [])].sort((a, b) => b.netSales - a.netSales),
    [summary?.breakdownByEmployee]
  );
  const topEmployee = sortedEmployees[0];
  const lowestEmployee = sortedEmployees[sortedEmployees.length - 1];
  const topSharePct = summary?.netSalesTotal ? Math.round(((topEmployee?.netSales ?? 0) * 100) / summary.netSalesTotal) : 0;

  const recommendationCards: Array<{ title: string; message: string; tone: 'warning' | 'danger' | 'info' | 'success' }> = [];
  if (monthPaceUi.tone === 'danger' || monthPaceUi.tone === 'warning') {
    recommendationCards.push({
      title: t('sales.summary.executive.recoPaceTitle'),
      message: t('sales.summary.executive.recoPaceMessage'),
      tone: monthPaceUi.tone,
    });
  }
  if (returnsUi.tone === 'danger' || returnsUi.tone === 'warning') {
    recommendationCards.push({
      title: t('sales.summary.executive.recoReturnsTitle'),
      message: t('sales.summary.executive.recoReturnsMessage'),
      tone: returnsUi.tone,
    });
  } else if (lowestEmployee) {
    recommendationCards.push({
      title: t('sales.summary.executive.recoSupportTitle'),
      message: t('sales.summary.executive.recoSupportMessage').replace('{name}', lowestEmployee.employeeName),
      tone: 'info',
    });
  }

  const heroTitle =
    monthPaceUi.tone === 'danger'
      ? t('sales.summary.executive.heroBehind')
      : monthPaceUi.tone === 'warning'
        ? t('sales.summary.executive.heroNear')
        : t('sales.summary.executive.heroAhead');
  const heroHint =
    monthPaceUi.tone === 'danger'
      ? t('sales.summary.executive.heroBehindHint')
      : monthPaceUi.tone === 'warning'
        ? t('sales.summary.executive.heroNearHint')
        : t('sales.summary.executive.heroAheadHint');

  return (
    <PageContainer className="mx-auto max-w-6xl space-y-8 md:space-y-10">
      <SectionBlock
        title={t('sales.summary.boardTitle')}
        subtitle={from && to ? `${selectedBoutique?.name ?? ''} • ${from} → ${to}` : t('sales.summary.subtitle')}
      >
        <FilterBar
          activeFilters={activeFilters}
          quickPeriods={QUICK_PERIODS}
          selectedPeriodId={selectedPeriodId}
          onPeriodSelect={handlePeriodSelect}
          summaryLine={summaryLine}
          onReset={handleReset}
        >
          <Input
            type="date"
            label="From"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setSelectedPeriodId('custom');
            }}
            className="min-w-[10rem]"
          />
          <Input
            type="date"
            label="To"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setSelectedPeriodId('custom');
            }}
            className="min-w-[10rem]"
          />
          {scopeReady && (
            <Select
              label={t('sales.summary.boutique')}
              value={boutiqueId}
              onChange={(e) => setBoutiqueId(e.target.value)}
              disabled={allowedBoutiques.length <= 1}
              options={boutiqueOptions}
              className="min-w-[10rem]"
              aria-label={t('sales.summary.boutique')}
            />
          )}
          <Button
            variant="primary"
            onClick={() => {
              load();
              loadTargets();
            }}
            disabled={loading}
          >
            {loading ? t('sales.summary.loading') : t('sales.summary.apply')}
          </Button>
        </FilterBar>
      </SectionBlock>
      {error && <p className="text-sm text-luxury-error">{error}</p>}

      {targetsLoading && !targets && <p className="text-sm text-muted">{t('sales.summary.loadingTargets')}</p>}

      {targets && (
        <RecommendationCard title={heroTitle} message={heroHint} tone={monthPaceUi.tone} className="border-2 p-5 md:p-6" />
      )}

      {targets && (
        <SectionBlock title={t('sales.summary.executive.kpiTitle')} subtitle={t('sales.summary.executive.kpiSubtitle')}>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <KPIStatCard
              title={t('sales.summary.executive.primaryTargetPct')}
              value={`${monthPacePct}%`}
              tone={paceToneForKpi}
              emphasis="strong"
              trendLabel={monthPaceUi.shortLabel}
            />
            <KPIStatCard
              title={t('sales.summary.remaining')}
              value={formatSarInt(remainingTarget)}
              tone={remainingToneForKpi}
              emphasis="strong"
            />
          </div>
          <KPIGrid cols={4} className="mt-3">
            <KPIStatCard title={t('sales.summary.netSales')} value={formatSarInt(summary?.netSalesTotal ?? 0)} tone="default" />
            <KPIStatCard title={t('sales.summary.executive.avgDailyNet')} value={formatSarInt(avgDailyNet)} tone="default" />
            <KPIStatCard title={t('sales.summary.returns')} value={formatSarInt(summary?.returnsTotal ?? 0)} tone={returnsUi.tone === 'success' ? 'default' : returnsUi.tone} />
            <KPIStatCard title={t('sales.summary.executive.activeSellers')} value={activeEmployees} tone="default" />
          </KPIGrid>
        </SectionBlock>
      )}

      {targets && (
        <SectionBlock title={t('sales.summary.executive.insightsTitle')} subtitle={t('sales.summary.executive.insightsSubtitle')}>
          <InsightGrid className="gap-4">
            <InsightCard
              title={t('sales.summary.executive.insightPaceTitle')}
              description={monthPaceUi.shortLabel}
              tone={monthPaceUi.tone}
              className="md:col-span-2"
            />
            <InsightCard
              title={t('sales.summary.executive.insightTopTitle')}
              description={
                topEmployee
                  ? t('sales.summary.executive.insightTopDesc')
                      .replace('{name}', topEmployee.employeeName)
                      .replace('{pct}', String(topSharePct))
                  : t('sales.summary.executive.insightNoEmployee')
              }
              tone={topEmployee ? 'success' : 'default'}
            />
            <InsightCard
              title={t('sales.summary.executive.insightReturnsTitle')}
              description={returnsUi.shortLabel}
              tone={returnsUi.tone}
            />
            <InsightCard
              title={t('sales.summary.executive.insightFocusTitle')}
              description={
                lowestEmployee
                  ? t('sales.summary.executive.insightFocusDesc').replace('{name}', lowestEmployee.employeeName)
                  : t('sales.summary.executive.insightNoEmployee')
              }
              tone={lowestEmployee ? 'warning' : 'default'}
            />
          </InsightGrid>
        </SectionBlock>
      )}

      {targets && (
        <SectionBlock title={t('sales.summary.executive.recommendedActionTitle')} subtitle={t('sales.summary.executive.recommendedActionSubtitle')}>
          {recommendationCards.length === 0 ? (
            <EmptyStateBlock title={t('sales.summary.executive.noRecommendationsTitle')} description={t('sales.summary.executive.noRecommendationsDesc')} />
          ) : (
            <InsightGrid>
              {recommendationCards.slice(0, 2).map((r, idx) => (
                <RecommendationCard key={`${r.title}-${idx}`} title={r.title} message={r.message} tone={r.tone} />
              ))}
            </InsightGrid>
          )}
        </SectionBlock>
      )}

      <SectionBlock title={t('sales.summary.executive.mainDataTitle')} subtitle={t('sales.summary.executive.mainDataSubtitle')}>
        {targets && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {[
              {
                label: t('sales.summary.week'),
                data: targets.week,
                sub: targets.week.from && targets.week.to
                  ? `${targets.week.from} – ${targets.week.to} · ${t('sales.summary.weekOfEndDate')}`
                  : t('sales.summary.weekOfEndDate'),
              },
              { label: t('sales.summary.month'), data: targets.month, sub: targets.month.key },
              { label: t('sales.summary.quarter'), data: targets.quarter, sub: targets.quarter.key },
              { label: t('sales.summary.halfYear'), data: targets.half, sub: targets.half.key },
              { label: t('sales.summary.year'), data: targets.year, sub: targets.year.key },
            ].map(({ label, data, sub }) => (
              <PerformanceKpiCard
                key={label}
                title={label}
                subtitle={sub}
                mainValue={formatSarInt(data.achievedSar)}
                mainValueLabel={t('sales.summary.achieved')}
                metricsSlot={
                  <div className="mt-3 space-y-1 text-xs">
                    <p className="text-muted">
                      {t('sales.summary.target')}: <span className="font-semibold tabular-nums text-foreground">{formatSarInt(data.targetSar)}</span>
                    </p>
                    <p className="text-muted">
                      {t('sales.summary.remaining')}: <span className="font-semibold tabular-nums text-foreground">{formatSarInt(data.remainingSar)}</span>
                    </p>
                  </div>
                }
                percent={data.pct}
                showPercentInline
                variant="compact"
                progressBarSize="md"
              />
            ))}
          </div>
        )}

        {targets?.dailyTrajectory && targets.dailyTrajectory.length > 0 && (
          <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm transition-shadow hover:shadow-md md:p-8">
            <p className="mb-6 text-xs text-muted">
              {t('sales.summary.chartMtdSubtitle')}{targets.monthKey ? ` · ${targets.monthKey}` : ''}
            </p>
            <TargetVsActualLineChart
              data={chartData}
              targetLine={chartTargetLine}
              height={260}
              valueFormat={(n) => formatSarInt(n)}
              emptyLabel="No sales data yet"
              theme="home"
            />
          </div>
        )}
      </SectionBlock>

      {summary && (
        <SectionBlock title={t('sales.summary.executive.secondaryTitle')} subtitle={t('sales.summary.sourcesNote')}>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {[
              { label: t('sales.summary.netSales'), value: summary.netSalesTotal, primary: true },
              { label: t('sales.summary.grossSales'), value: summary.grossSalesTotal, primary: false },
              { label: t('sales.summary.returns'), value: summary.returnsTotal, primary: false },
              { label: t('sales.summary.guestCoverageNet'), value: summary.guestCoverageNetSales, primary: false },
            ].map(({ label, value, primary }) => (
              <div
                key={label}
                className={`rounded-2xl border border-border bg-surface p-4 shadow-sm transition-shadow hover:shadow-md ${
                  primary ? 'ring-1 ring-accent/20' : ''
                }`}
              >
                <p className="text-xs font-medium uppercase tracking-wider text-muted">{label}</p>
                <p className={`mt-2 tabular-nums ${primary ? 'text-2xl font-bold text-foreground' : 'text-xl font-semibold text-foreground'}`}>
                  {formatSarInt(value)}
                </p>
              </div>
            ))}
          </div>
        </SectionBlock>
      )}

      {summary && (
        <SectionBlock title={t('sales.summary.executive.employeeContributionTitle')}>
          {summary.netSalesTotal === 0 && summary.breakdownByEmployee.length === 0 ? (
            <div className="rounded-2xl border border-border bg-surface p-12">
              <EmptyState title={t('sales.summary.noDataForPeriod')} />
            </div>
          ) : summary.breakdownByEmployee.length > 0 ? (
            (() => {
              const totalNet = summary.netSalesTotal || 1;
              const sorted = [...summary.breakdownByEmployee].sort((a, b) => b.netSales - a.netSales);
              const top3Ids = new Set(sorted.slice(0, 3).map((r) => r.employeeId));
              return (
                <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
                  <DataTable variant="luxury" zebra>
                    <DataTableHead>
                      <DataTableTh className="text-start">#</DataTableTh>
                      <DataTableTh className="text-start">{t('sales.summary.employee')}</DataTableTh>
                      <DataTableTh className="text-end">{t('sales.summary.net')}</DataTableTh>
                      <DataTableTh className="text-end">{t('sales.summary.contributionPct')}</DataTableTh>
                      <DataTableTh className="text-end">{t('sales.summary.guestCoverage')}</DataTableTh>
                      <DataTableTh className="text-start">{t('sales.summary.sourceBoutique')}</DataTableTh>
                    </DataTableHead>
                    <DataTableBody>
                      {sorted.map((row, idx) => {
                        const contributionPct = totalNet > 0 ? Math.round((row.netSales * 100) / totalNet) : 0;
                        const isTopContributor = top3Ids.has(row.employeeId);
                        return (
                          <tr key={row.employeeId} className={isTopContributor ? 'bg-emerald-50/30' : ''}>
                            <DataTableTd className="text-start">
                              <span className={`font-semibold tabular-nums ${idx < 3 ? 'text-foreground' : 'text-muted'}`}>
                                {idx + 1}
                              </span>
                              {idx < 3 && (
                                <span className="ms-1.5 inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800">
                                  Top {idx + 1}
                                </span>
                              )}
                            </DataTableTd>
                            <DataTableTd className="text-start font-medium text-foreground">{row.employeeName}</DataTableTd>
                            <DataTableTd className="text-end font-semibold tabular-nums text-foreground">
                              {formatSarInt(row.netSales)}
                            </DataTableTd>
                            <DataTableTd className="text-end tabular-nums">{contributionPct}%</DataTableTd>
                            <DataTableTd className="text-end">{formatSarInt(row.guestCoverageNetSales)}</DataTableTd>
                            <DataTableTd className="text-start">
                              {row.guestCoverageSources.map((s) => (
                                <span key={s.sourceBoutiqueId} className="me-2">
                                  {s.sourceBoutiqueName ?? s.sourceBoutiqueId}: {formatSarInt(s.netSales)}
                                </span>
                              ))}
                            </DataTableTd>
                          </tr>
                        );
                      })}
                    </DataTableBody>
                  </DataTable>
                </div>
              );
            })()
          ) : null}
        </SectionBlock>
      )}
    </PageContainer>
  );
}
