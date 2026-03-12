'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { formatSarInt } from '@/lib/utils/money';
import { useT } from '@/lib/i18n/useT';
import { PageHeader } from '@/components/ui/PageHeader';
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

function getPerformanceColor(percent: number): string {
  if (percent >= 100) return 'bg-emerald-500';
  if (percent >= 60) return 'bg-amber-500';
  return 'bg-red-500';
}

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

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title={t('sales.summary.boardTitle')}
        subtitle={from && to ? `${selectedBoutique?.name ?? ''} • ${from} → ${to}` : t('sales.summary.subtitle')}
      />
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
          onClick={() => { load(); loadTargets(); }}
          disabled={loading}
        >
          {loading ? t('sales.summary.loading') : t('sales.summary.apply')}
        </Button>
      </FilterBar>
      {error && <p className="text-sm text-luxury-error">{error}</p>}

      {targetsLoading && !targets && <p className="text-sm text-muted">{t('sales.summary.loadingTargets')}</p>}

      {/* Part 2 — Top KPI Section */}
      {targets && (
        <section>
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
            {t('sales.summary.boutiqueTargets')}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {[
              { label: t('sales.summary.week'), data: targets.week, sub: targets.week.from && targets.week.to ? `${targets.week.from} – ${targets.week.to}` : undefined },
              { label: t('sales.summary.month'), data: targets.month, sub: targets.month.key },
              { label: t('sales.summary.quarter'), data: targets.quarter, sub: targets.quarter.key },
              { label: t('sales.summary.halfYear'), data: targets.half, sub: targets.half.key },
              { label: t('sales.summary.year'), data: targets.year, sub: targets.year.key },
            ].map(({ label, data, sub }) => (
              <div
                key={label}
                className="rounded-2xl border border-border bg-surface p-5 shadow-sm transition-all duration-200 hover:shadow-md hover:border-border/80"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted">{label}</p>
                {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
                <p className="mt-3 text-2xl font-bold tabular-nums text-foreground md:text-3xl">
                  {formatSarInt(data.achievedSar)}
                </p>
                <p className="text-xs text-muted">{t('sales.summary.achieved')}</p>
                <div className="mt-3 space-y-1 text-xs">
                  <p className="text-muted">
                    {t('sales.summary.target')}: <span className="font-semibold tabular-nums text-foreground">{formatSarInt(data.targetSar)}</span>
                  </p>
                  <p className="text-muted">
                    {t('sales.summary.remaining')}: <span className="font-semibold tabular-nums text-foreground">{formatSarInt(data.remainingSar)}</span>
                  </p>
                </div>
                <p className="mt-2 text-sm font-bold tabular-nums">{data.pct}%</p>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-surface-subtle">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${getPerformanceColor(data.pct)}`}
                    style={{ width: `${Math.min(data.pct, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Part 4 — Visual Analytics Section */}
      {targets?.dailyTrajectory && targets.dailyTrajectory.length > 0 && (
        <section>
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
            Target vs Actual (MTD)
          </h2>
          <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm transition-shadow hover:shadow-md md:p-8">
            <p className="mb-6 text-xs text-muted">
              Cumulative sales vs target by day • {targets.monthKey ?? ''}
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
        </section>
      )}

      {/* Part 5 — Sales Breakdown Strip */}
      {summary && (
        <section>
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
            Sales Summary
          </h2>
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
          <p className="mt-2 text-xs text-muted">{t('sales.summary.sourcesNote')}</p>
        </section>
      )}

      {/* Part 6 — Employee Contribution Board */}
      {summary && (
        <section>
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
            Employee Contribution
          </h2>
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
                      <DataTableTh className="text-end">{t('sales.summary.progress')} %</DataTableTh>
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
                            <DataTableTd className="text-end tabular-nums text-muted">—</DataTableTd>
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
        </section>
      )}
    </div>
  );
}
