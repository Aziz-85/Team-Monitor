'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useT } from '@/lib/i18n/useT';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { PanelCard } from '@/components/ui/PanelCard';
import { Card } from '@/components/ui/Card';
import { ChartCard } from '@/components/ui/ChartCard';
import { FeedbackBanner } from '@/components/ui/FeedbackBanner';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  DataTable,
  DataTableBody,
  DataTableHead,
  DataTableTh,
  DataTableTd,
} from '@/components/ui/DataTable';
import type { PerformanceHubPayload } from '@/lib/performance/hubEngine';

type Bootstrap = {
  role: string;
  allowedBoutiqueIds: string[];
  boutiques: { id: string; code: string; name: string; regionId: string | null }[];
  regions: { id: string; name: string; code: string }[];
  canCompareBoutiques: boolean;
  canCompareRegions: boolean;
  defaultBoutiqueIds: string[];
};

type Period = 'day' | 'week' | 'month' | 'quarter' | 'half' | 'year';

export function PerformanceHubClient() {
  const { t } = useT();
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [payload, setPayload] = useState<PerformanceHubPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [entity, setEntity] = useState<'boutique' | 'employees'>('boutique');
  const [period, setPeriod] = useState<Period>('month');
  const [anchor, setAnchor] = useState(() => new Date().toISOString().slice(0, 10));
  const [compare, setCompare] = useState<'none' | 'boutiques' | 'regions'>('none');
  const [selectedBoutiques, setSelectedBoutiques] = useState<string[]>([]);
  const [selectedRegions, setSelectedRegions] = useState<string[]>([]);
  const [employeeUserId, setEmployeeUserId] = useState('');

  const loadBootstrap = useCallback(async () => {
    const r = await fetch('/api/performance/hub?bootstrap=1', { cache: 'no-store' });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new Error((j as { error?: string }).error ?? t('performanceHub.loadError'));
    }
    const data = (await r.json()) as Bootstrap;
    setBoot(data);
    setSelectedBoutiques(data.defaultBoutiqueIds.length > 0 ? data.defaultBoutiqueIds : data.allowedBoutiqueIds.slice(0, 1));
  }, [t]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('entity', entity);
      params.set('period', period);
      params.set('anchor', anchor);
      params.set('compare', compare);
      if (selectedBoutiques.length > 0) params.set('boutiqueIds', selectedBoutiques.join(','));
      if (selectedRegions.length > 0) params.set('regionIds', selectedRegions.join(','));
      if (employeeUserId) params.set('employeeUserId', employeeUserId);
      const r = await fetch(`/api/performance/hub?${params}`, { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error((j as { error?: string }).error ?? t('performanceHub.loadError'));
      setPayload(j as PerformanceHubPayload);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('performanceHub.loadError'));
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [anchor, compare, employeeUserId, entity, period, selectedBoutiques, selectedRegions, t]);

  useEffect(() => {
    loadBootstrap().catch((e) => setError(e instanceof Error ? e.message : t('performanceHub.loadError')));
  }, [loadBootstrap, t]);

  useEffect(() => {
    if (!boot) return;
    loadData();
  }, [boot, loadData]);

  const boutiqueOptions = useMemo(
    () =>
      boot?.boutiques.map((b) => ({
        value: b.id,
        label: `${b.name} (${b.code})`,
      })) ?? [],
    [boot]
  );

  const regionOptions = useMemo(
    () => boot?.regions.map((r) => ({ value: r.id, label: r.name })) ?? [],
    [boot]
  );

  const toggleBoutique = (id: string) => {
    if (!boot?.canCompareBoutiques || compare !== 'boutiques') {
      setSelectedBoutiques([id]);
      return;
    }
    setSelectedBoutiques((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleRegion = (id: string) => {
    setSelectedRegions((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const maxSeries = useMemo(() => {
    if (!payload?.entities?.length) return 1;
    let m = 1;
    for (const e of payload.entities) {
      for (const p of e.series) {
        m = Math.max(m, p.targetSales, p.actualSales);
      }
    }
    return m;
  }, [payload]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader title={t('performanceHub.title')} subtitle={t('performanceHub.subtitle')} />

      {error ? (
        <FeedbackBanner variant="error" message={error} onDismiss={() => setError(null)} />
      ) : null}

      <PanelCard title={t('performanceHub.filtersTitle')}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={entity === 'boutique' ? 'primary' : 'secondary'}
              onClick={() => setEntity('boutique')}
            >
              {t('performanceHub.entityBoutique')}
            </Button>
            <Button
              type="button"
              variant={entity === 'employees' ? 'primary' : 'secondary'}
              onClick={() => setEntity('employees')}
            >
              {t('performanceHub.entityEmployees')}
            </Button>
          </div>
          <div className="flex flex-wrap gap-1 border border-border rounded-lg p-1 bg-surface-subtle">
            {(
              [
                'day',
                'week',
                'month',
                'quarter',
                'half',
                'year',
              ] as const
            ).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  period === p
                    ? 'bg-accent text-white'
                    : 'text-muted hover:text-foreground hover:bg-surface'
                }`}
              >
                {t(`performanceHub.period${p.charAt(0).toUpperCase() + p.slice(1)}` as 'performanceHub.periodDay')}
              </button>
            ))}
          </div>
          <label className="flex flex-col gap-1 text-xs text-muted">
            {t('performanceHub.anchorDate')}
            <input
              type="date"
              value={anchor}
              onChange={(e) => setAnchor(e.target.value)}
              className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-foreground"
            />
          </label>
          {boot?.canCompareBoutiques || boot?.canCompareRegions ? (
            <Select
              label=""
              value={compare}
              onChange={(e) => setCompare(e.target.value as 'none' | 'boutiques' | 'regions')}
              options={[
                { value: 'none', label: t('performanceHub.compareNone') },
                ...(boot.canCompareBoutiques
                  ? [{ value: 'boutiques', label: t('performanceHub.compareBoutiques') }]
                  : []),
                ...(boot.canCompareRegions
                  ? [{ value: 'regions', label: t('performanceHub.compareRegions') }]
                  : []),
              ]}
              className="min-w-[10rem]"
            />
          ) : null}
          <Button variant="primary" type="button" onClick={() => loadData()} disabled={loading}>
            {loading ? '…' : t('performanceHub.refresh')}
          </Button>
        </div>

        {boot && compare === 'boutiques' && boot.canCompareBoutiques ? (
          <div className="mt-4">
            <p className="mb-2 text-xs font-medium text-muted">{t('performanceHub.boutiques')}</p>
            <div className="flex flex-wrap gap-2">
              {boutiqueOptions.map((o) => (
                <label key={o.value} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedBoutiques.includes(o.value)}
                    onChange={() => toggleBoutique(o.value)}
                  />
                  {o.label}
                </label>
              ))}
            </div>
          </div>
        ) : boot && compare !== 'regions' ? (
          <div className="mt-4 max-w-md">
            <Select
              label={t('performanceHub.boutiques')}
              value={selectedBoutiques[0] ?? ''}
              onChange={(e) => setSelectedBoutiques(e.target.value ? [e.target.value] : [])}
              options={boutiqueOptions}
            />
          </div>
        ) : null}

        {boot && compare === 'regions' && boot.canCompareRegions ? (
          <div className="mt-4">
            <p className="mb-2 text-xs font-medium text-muted">{t('performanceHub.regions')}</p>
            <div className="flex flex-wrap gap-2">
              {regionOptions.map((o) => (
                <label key={o.value} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedRegions.includes(o.value)}
                    onChange={() => toggleRegion(o.value)}
                  />
                  {o.label}
                </label>
              ))}
            </div>
          </div>
        ) : null}

        {entity === 'employees' ? (
          <div className="mt-4 max-w-md">
            <Select
              label={t('performanceHub.employee')}
              value={employeeUserId}
              onChange={(e) => setEmployeeUserId(e.target.value)}
              options={[{ value: '', label: t('performanceHub.allEmployees') }]}
            />
          </div>
        ) : null}
      </PanelCard>

      {payload && !loading ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Card className="!p-4">
              <p className="text-xs uppercase tracking-wide text-muted">{t('performanceHub.kpiActual')}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {payload.summary.actualSales.toLocaleString()} {t('performanceHub.sar')}
              </p>
            </Card>
            <Card className="!p-4">
              <p className="text-xs uppercase tracking-wide text-muted">{t('performanceHub.kpiTarget')}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {payload.summary.targetSales.toLocaleString()} {t('performanceHub.sar')}
              </p>
            </Card>
            <Card className="!p-4">
              <p className="text-xs uppercase tracking-wide text-muted">{t('performanceHub.kpiAchievement')}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{payload.summary.achievementPct}%</p>
            </Card>
            <Card className="!p-4">
              <p className="text-xs uppercase tracking-wide text-muted">{t('performanceHub.kpiGap')}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {payload.summary.gapSales.toLocaleString()} {t('performanceHub.sar')}
              </p>
            </Card>
            <Card className="!p-4">
              <p className="text-xs uppercase tracking-wide text-muted">{t('performanceHub.kpiBestPeriod')}</p>
              <p className="mt-1 text-lg font-medium">{payload.summary.bestPeriodLabel}</p>
            </Card>
            {payload.summary.bestPerformerLabel ? (
              <Card className="!p-4">
                <p className="text-xs uppercase tracking-wide text-muted">{t('performanceHub.kpiBestPerformer')}</p>
                <p className="mt-1 text-lg font-medium">{payload.summary.bestPerformerLabel}</p>
              </Card>
            ) : null}
          </div>

          {entity === 'boutique' && payload.entities.length > 0 ? (
            <ChartCard title={t('performanceHub.chartTitle')} subtitle={payload.windowLabel}>
              <div className="space-y-6 overflow-x-auto">
                {payload.entities.map((ent) => (
                  <div key={ent.id}>
                    <p className="mb-2 text-sm font-medium text-foreground">{ent.label}</p>
                    <div className="flex min-h-[140px] items-end gap-1 border-b border-border pb-8 pt-2">
                      {ent.series.map((pt) => {
                        const hAct = maxSeries > 0 ? Math.round((pt.actualSales / maxSeries) * 100) : 0;
                        const hTgt = maxSeries > 0 ? Math.round((pt.targetSales / maxSeries) * 100) : 0;
                        return (
                          <div
                            key={pt.label}
                            className="flex min-w-[1.5rem] flex-1 flex-col items-center justify-end gap-0.5"
                            title={`${pt.label}: ${pt.actualSales} / ${pt.targetSales}`}
                          >
                            <div className="flex w-full max-w-[2rem] items-end justify-center gap-0.5" style={{ height: 100 }}>
                              <div
                                className="w-2 rounded-sm bg-border"
                                style={{ height: `${Math.max(hTgt, 2)}%` }}
                              />
                              <div
                                className="w-2 rounded-sm bg-accent"
                                style={{ height: `${Math.max(hAct, 2)}%` }}
                              />
                            </div>
                            <span className="mt-1 max-w-[3.5rem] truncate text-center text-[10px] text-muted">
                              {pt.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-2 flex gap-4 text-xs text-muted">
                      <span className="flex items-center gap-1">
                        <span className="inline-block h-2 w-2 rounded-sm bg-border" /> Target
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="inline-block h-2 w-2 rounded-sm bg-accent" /> Actual
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </ChartCard>
          ) : null}

          {entity === 'boutique' && payload.bests ? (
            <ChartCard title={t('performanceHub.insightsTitle')}>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
                <div>
                  <p className="text-muted text-xs">Best day (sales)</p>
                  <p className="font-medium tabular-nums">
                    {payload.bests.bestDaySales.value.toLocaleString()} — {payload.bests.bestDaySales.label}
                  </p>
                </div>
                <div>
                  <p className="text-muted text-xs">Best month (sales)</p>
                  <p className="font-medium tabular-nums">
                    {payload.bests.bestMonthSales.value.toLocaleString()} — {payload.bests.bestMonthSales.label}
                  </p>
                </div>
                <div>
                  <p className="text-muted text-xs">Best year (sales)</p>
                  <p className="font-medium tabular-nums">
                    {payload.bests.bestYearSales.value.toLocaleString()} — {payload.bests.bestYearSales.label}
                  </p>
                </div>
                <div>
                  <p className="text-muted text-xs">Highest achievement % (month)</p>
                  <p className="font-medium tabular-nums">
                    {payload.bests.bestMonthAchievementPct.value}% — {payload.bests.bestMonthAchievementPct.label}
                  </p>
                </div>
                <div>
                  <p className="text-muted text-xs">Highest sales (any bucket)</p>
                  <p className="font-medium tabular-nums">{payload.bests.highestSalesValue.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-muted text-xs">Peak achievement % (scan)</p>
                  <p className="font-medium tabular-nums">{payload.bests.highestAchievementPct}%</p>
                </div>
              </div>
            </ChartCard>
          ) : null}

          {entity === 'boutique' ? (
            <DataTable variant="luxury" zebra>
              <DataTableHead>
                <DataTableTh>{t('performanceHub.tablePeriod')}</DataTableTh>
                <DataTableTh className="text-end">{t('performanceHub.tableSales')}</DataTableTh>
                <DataTableTh className="text-end">{t('performanceHub.tableTarget')}</DataTableTh>
                <DataTableTh className="text-end">{t('performanceHub.tableAchievement')}</DataTableTh>
                <DataTableTh className="text-end">{t('performanceHub.tableGap')}</DataTableTh>
              </DataTableHead>
              <DataTableBody>
                {payload.entities.map((e) => (
                  <tr key={e.id}>
                    <DataTableTd>{e.label}</DataTableTd>
                    <DataTableTd className="text-end tabular-nums">{e.actualSales.toLocaleString()}</DataTableTd>
                    <DataTableTd className="text-end tabular-nums">{e.targetSales.toLocaleString()}</DataTableTd>
                    <DataTableTd className="text-end tabular-nums">{e.achievementPct}%</DataTableTd>
                    <DataTableTd className="text-end tabular-nums">{e.gapSales.toLocaleString()}</DataTableTd>
                  </tr>
                ))}
              </DataTableBody>
            </DataTable>
          ) : payload.employees.length === 0 ? (
            <EmptyState title={t('performanceHub.emptyEmployees')} />
          ) : (
            <DataTable variant="luxury" zebra>
              <DataTableHead>
                <DataTableTh>{t('performanceHub.tableEmployee')}</DataTableTh>
                <DataTableTh className="text-end">{t('performanceHub.tableSales')}</DataTableTh>
                <DataTableTh className="text-end">{t('performanceHub.tableTarget')}</DataTableTh>
                <DataTableTh className="text-end">{t('performanceHub.tableAchievement')}</DataTableTh>
                <DataTableTh className="text-end">{t('performanceHub.tableGap')}</DataTableTh>
                <DataTableTh>{t('performanceHub.tableBestPeriod')}</DataTableTh>
              </DataTableHead>
              <DataTableBody>
                {payload.employees.map((r) => (
                  <tr key={r.userId}>
                    <DataTableTd>
                      {r.name} ({r.empId})
                    </DataTableTd>
                    <DataTableTd className="text-end tabular-nums">{r.actualSales.toLocaleString()}</DataTableTd>
                    <DataTableTd className="text-end tabular-nums">{r.targetSales.toLocaleString()}</DataTableTd>
                    <DataTableTd className="text-end tabular-nums">{r.achievementPct}%</DataTableTd>
                    <DataTableTd className="text-end tabular-nums">{r.gapSales.toLocaleString()}</DataTableTd>
                    <DataTableTd>{r.bestPeriodLabel}</DataTableTd>
                  </tr>
                ))}
              </DataTableBody>
            </DataTable>
          )}
        </>
      ) : loading ? (
        <EmptyState title={t('common.loading')} />
      ) : null}
    </div>
  );
}
