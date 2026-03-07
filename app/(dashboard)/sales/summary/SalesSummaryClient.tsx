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

  // Read URL on mount and when searchParams change
  useEffect(() => {
    const fromParam = searchParams.get('from')?.trim() || '';
    const toParam = searchParams.get('to')?.trim() || '';
    const boutiqueParam = searchParams.get('boutiqueId')?.trim() || '';
    if (fromParam) setFrom(fromParam);
    if (toParam) setTo(toParam);
    if (boutiqueParam) setBoutiqueId(boutiqueParam);
    if (fromParam || toParam) setSelectedPeriodId('custom');
  }, [searchParams]);

  // Default date range when not in URL
  useEffect(() => {
    if (from || to) return;
    const { from: defaultFrom, to: defaultTo } = getDefaultDateRange();
    setFrom(defaultFrom);
    setTo(defaultTo);
  }, [from, to]);

  // Fetch operational boutique and allowed boutiques; resolve default boutique and validate URL
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

  // When scope is ready, ensure boutiqueId is set to a valid allowed boutique (default or from URL)
  useEffect(() => {
    if (!scopeReady || allowedBoutiques.length === 0) return;
    const defaultId = operationalBoutique?.boutiqueId ?? allowedBoutiques[0]?.id ?? '';
    if (!defaultId) return;
    setBoutiqueId((prev) => {
      if (prev && allowedBoutiques.some((b) => b.id === prev)) return prev;
      return defaultId;
    });
  }, [scopeReady, operationalBoutique?.boutiqueId, allowedBoutiques]);

  // Sync URL when from, to, boutiqueId or scope become ready (one-way: state -> URL)
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

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader title={t('sales.summary.title')} subtitle={t('sales.summary.subtitle')} />
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
      {targets && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted">{t('sales.summary.boutiqueTargets')}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[
              { label: t('sales.summary.week'), data: targets.week, sub: targets.week.from && targets.week.to ? `${targets.week.from} – ${targets.week.to}` : undefined },
              { label: t('sales.summary.month'), data: targets.month, sub: targets.month.key },
              { label: t('sales.summary.quarter'), data: targets.quarter, sub: targets.quarter.key },
              { label: t('sales.summary.halfYear'), data: targets.half, sub: targets.half.key },
              { label: t('sales.summary.year'), data: targets.year, sub: targets.year.key },
            ].map(({ label, data, sub }) => (
              <div key={label} className="rounded-lg border border-border bg-surface p-4 shadow-sm">
                <p className="text-sm font-medium text-slate-700">{label}</p>
                {sub && <p className="text-xs text-slate-500">{sub}</p>}
                <p className="mt-1 text-xs text-slate-600">{t('sales.summary.target')}: {formatSarInt(data.targetSar)}</p>
                <p className="text-xs text-slate-600">{t('sales.summary.achieved')}: {formatSarInt(data.achievedSar)}</p>
                <p className="text-xs text-slate-600">{t('sales.summary.remaining')}: {formatSarInt(data.remainingSar)}</p>
                <p className="mt-1 text-sm font-medium">{t('sales.summary.progress')}: {data.pct}%</p>
                <div className="mt-1 h-2 w-full overflow-hidden rounded bg-slate-100">
                  <div
                    className="h-full rounded bg-slate-400 transition-[width]"
                    style={{ width: `${Math.min(data.pct, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {summary && (
        <div className="space-y-4 rounded-lg border border-border bg-surface p-4 shadow-sm">
          <p className="text-sm text-foreground">
            {summary.from} – {summary.to}
          </p>
          <p className="text-xs text-muted">{t('sales.summary.sourcesNote')}</p>
          {summary.netSalesTotal === 0 && summary.breakdownByEmployee.length === 0 && (
            <EmptyState title={t('sales.summary.noDataForPeriod')} />
          )}
          <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
            <div className="rounded border border-border p-2">
              <p className="text-muted">{t('sales.summary.netSales')}</p>
              <p className="font-medium text-foreground">{formatSarInt(summary.netSalesTotal)}</p>
            </div>
            <div className="rounded border border-border p-2">
              <p className="text-muted">{t('sales.summary.grossSales')}</p>
              <p className="text-foreground">{formatSarInt(summary.grossSalesTotal)}</p>
            </div>
            <div className="rounded border border-border p-2">
              <p className="text-muted">{t('sales.summary.returns')}</p>
              <p className="text-foreground">{formatSarInt(summary.returnsTotal)}</p>
            </div>
            <div className="rounded border border-border p-2">
              <p className="text-muted">{t('sales.summary.guestCoverageNet')}</p>
              <p className="text-foreground">{formatSarInt(summary.guestCoverageNetSales)}</p>
            </div>
          </div>
          {summary.breakdownByEmployee.length > 0 ? (
            <DataTable variant="luxury" zebra>
              <DataTableHead>
                <DataTableTh className="text-start">{t('sales.summary.employee')}</DataTableTh>
                <DataTableTh className="text-end">{t('sales.summary.net')}</DataTableTh>
                <DataTableTh className="text-end">{t('sales.summary.guestCoverage')}</DataTableTh>
                <DataTableTh className="text-start">{t('sales.summary.sourceBoutique')}</DataTableTh>
              </DataTableHead>
              <DataTableBody>
                {summary.breakdownByEmployee.map((row) => (
                  <tr key={row.employeeId}>
                    <DataTableTd className="text-start">{row.employeeName}</DataTableTd>
                    <DataTableTd className="text-end">{formatSarInt(row.netSales)}</DataTableTd>
                    <DataTableTd className="text-end">{formatSarInt(row.guestCoverageNetSales)}</DataTableTd>
                    <DataTableTd className="text-start">
                      {row.guestCoverageSources.map((s) => (
                        <span key={s.sourceBoutiqueId} className="me-2">
                          {s.sourceBoutiqueName ?? s.sourceBoutiqueId}: {formatSarInt(s.netSales)}
                        </span>
                      ))}
                    </DataTableTd>
                  </tr>
                ))}
              </DataTableBody>
            </DataTable>
          ) : null}
        </div>
      )}
    </div>
  );
}
