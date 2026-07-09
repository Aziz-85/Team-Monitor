'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useT } from '@/lib/i18n/useT';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import {
  DataTable,
  DataTableHead,
  DataTableTh,
  DataTableBody,
  DataTableTd,
} from '@/components/ui/DataTable';
import type {
  YearlyImportPreviewRow,
  YearlyImportPreviewTotals,
  YearlySalesApplyPlan,
} from '@/lib/sales/yearlyEmployeeSalesImport';

type PreviewFilter = 'all' | 'insert' | 'update' | 'no_change' | 'errors';

type DryRunResult = {
  previewRows: YearlyImportPreviewRow[];
  previewTotals: YearlyImportPreviewTotals;
  applyPlan: YearlySalesApplyPlan;
  canApply: boolean;
  applyBlockReasons: string[];
  boutiqueMismatch: string | null;
  parseErrors: { row: number; colHeader: string; reason: string }[];
};

function formatAmount(value: number | null | undefined): string {
  if (value == null) return '—';
  return value.toLocaleString('en-US');
}

function actionBadgeVariant(action: string): 'success' | 'warning' | 'neutral' | 'danger' {
  if (action === 'INSERT') return 'success';
  if (action === 'UPDATE') return 'warning';
  if (action === 'ERROR') return 'danger';
  return 'neutral';
}

function matchesFilter(action: string, filter: PreviewFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'insert') return action === 'INSERT';
  if (filter === 'update') return action === 'UPDATE';
  if (filter === 'no_change') return action === 'NO_CHANGE';
  return action === 'ERROR';
}

export function YearlySalesImportClient() {
  const { t } = useT();
  const [year, setYear] = useState(() => String(new Date().getFullYear()));
  const [scopeLabel, setScopeLabel] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<DryRunResult | null>(null);
  const [applyPlan, setApplyPlan] = useState<YearlySalesApplyPlan | null>(null);
  const [previewFilter, setPreviewFilter] = useState<PreviewFilter>('all');
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<{
    batchId: string;
    inserted: number;
    updated: number;
    rejected: number;
  } | null>(null);

  const refreshScopeLabel = useCallback(() => {
    fetch('/api/me/scope', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { resolved?: { label?: string } } | null) => {
        setScopeLabel(data?.resolved?.label ?? null);
      })
      .catch(() => setScopeLabel(null));
  }, []);

  useEffect(() => {
    refreshScopeLabel();
    const onScopeChanged = () => refreshScopeLabel();
    window.addEventListener('scope-changed', onScopeChanged);
    return () => window.removeEventListener('scope-changed', onScopeChanged);
  }, [refreshScopeLabel]);

  const filteredRows = useMemo(() => {
    if (!preview?.previewRows) return [];
    return preview.previewRows.filter((row) => matchesFilter(row.action, previewFilter));
  }, [preview?.previewRows, previewFilter]);

  const downloadTemplate = () => {
    if (!/^\d{4}$/.test(year.trim())) return;
    window.open(`/api/sales/import/yearly/template?year=${encodeURIComponent(year.trim())}`, '_blank');
  };

  const runDryRun = async () => {
    if (!file) return;
    setLoading(true);
    setPreview(null);
    setApplyPlan(null);
    setApplyResult(null);
    setPreviewFilter('all');
    const formData = new FormData();
    formData.set('file', file);
    try {
      const res = await fetch('/api/sales/import/yearly/dry-run', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      const data = (await res.json()) as DryRunResult & { error?: string };
      if (!res.ok) {
        setPreview(null);
        setApplyPlan(null);
        return;
      }
      setPreview(data);
      setApplyPlan(data.applyPlan);
    } catch {
      setPreview(null);
      setApplyPlan(null);
    } finally {
      setLoading(false);
    }
  };

  const runApply = async () => {
    if (!applyPlan || !preview?.canApply) return;
    setApplying(true);
    const formData = new FormData();
    formData.set('applyPlan', JSON.stringify(applyPlan));
    try {
      const res = await fetch('/api/sales/import/yearly/apply', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      const data = await res.json();
      if (res.ok) {
        setApplyResult({
          batchId: data.batchId,
          inserted: data.inserted ?? 0,
          updated: data.updated ?? 0,
          rejected: data.rejected ?? 0,
        });
        setPreview(null);
        setApplyPlan(null);
        setFile(null);
      }
    } finally {
      setApplying(false);
    }
  };

  const filterButtons: { id: PreviewFilter; label: string }[] = [
    { id: 'all', label: t('sales.yearlyImportPage.filterAll') },
    { id: 'insert', label: t('sales.yearlyImportPage.filterInserts') },
    { id: 'update', label: t('sales.yearlyImportPage.filterUpdates') },
    { id: 'no_change', label: t('sales.yearlyImportPage.filterNoChange') },
    { id: 'errors', label: t('sales.yearlyImportPage.filterErrors') },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/sales/daily" className="text-sm text-muted hover:text-foreground">
          ← {t('sales.yearlyImportPage.backToSales')}
        </Link>
      </div>
      <PageHeader
        title={t('sales.yearlyImportPage.title')}
        subtitle={t('sales.yearlyImportPage.subtitle')}
      />

      <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
        <h3 className="mb-2 text-sm font-semibold text-foreground">
          {t('sales.yearlyImportPage.templateTitle')}
        </h3>
        {scopeLabel ? (
          <p className="mb-3 text-xs text-muted">
            {t('sales.yearlyImportPage.currentBoutique')}:{' '}
            <span className="font-medium text-foreground">{scopeLabel}</span>
          </p>
        ) : null}
        <p className="mb-3 text-xs text-muted">{t('sales.yearlyImportPage.templateHint')}</p>
        <label className="mb-3 block text-xs text-muted">
          {t('sales.yearlyImportPage.year')}
          <input
            type="number"
            min={2020}
            max={2100}
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="mt-1 block h-10 w-full max-w-xs rounded-md border border-border bg-surface px-3 text-sm text-foreground"
          />
        </label>
        <Button variant="secondary" onClick={downloadTemplate}>
          {t('sales.yearlyImportPage.downloadTemplate')}
        </Button>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 text-sm text-amber-900">
        <p>{t('sales.yearlyImportPage.sheetHint')}</p>
        <p>{t('sales.yearlyImportPage.blankHint')}</p>
      </div>

      <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-foreground">{t('sales.yearlyImportPage.uploadTitle')}</h3>
        <div className="flex flex-wrap items-end gap-3">
          <input
            type="file"
            accept=".xlsx,.xlsm"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setPreview(null);
              setApplyPlan(null);
              setApplyResult(null);
            }}
            className="text-sm text-foreground"
          />
          <Button variant="primary" onClick={runDryRun} disabled={!file || loading}>
            {loading ? t('common.loading') : t('sales.yearlyImportPage.dryRun')}
          </Button>
          <Button variant="primary" onClick={runApply} disabled={!preview?.canApply || applying}>
            {applying ? t('common.loading') : t('sales.yearlyImportPage.confirmApply')}
          </Button>
        </div>
      </div>

      {applyResult && (
        <div className="rounded-lg border border-border bg-surface p-4 text-sm text-foreground shadow-sm">
          <p className="font-medium">{t('sales.yearlyImportPage.applySuccess')}</p>
          <p>
            {t('sales.yearlyImportPage.inserted')}: {applyResult.inserted} ·{' '}
            {t('sales.yearlyImportPage.updated')}: {applyResult.updated}
            {applyResult.rejected > 0 ? ` · ${t('sales.yearlyImportPage.rejected')}: ${applyResult.rejected}` : ''}
          </p>
          <p className="mt-1 text-xs text-muted">
            {t('sales.yearlyImportPage.batchId')}: {applyResult.batchId}
          </p>
        </div>
      )}

      {preview && (
        <div className="space-y-4 rounded-lg border border-border bg-surface p-4 shadow-sm">
          {preview.boutiqueMismatch && (
            <div className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-800">
              {preview.boutiqueMismatch}
            </div>
          )}
          {preview.applyBlockReasons.length > 0 && !preview.canApply && (
            <div className="rounded border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900">
              <p className="font-medium">{t('sales.yearlyImportPage.applyBlocked')}</p>
              <ul className="list-disc pl-4">
                {preview.applyBlockReasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4 lg:grid-cols-8">
            <Stat label={t('sales.yearlyImportPage.statRows')} value={preview.previewTotals.totalRows} />
            <Stat label={t('sales.yearlyImportPage.statCells')} value={preview.previewTotals.totalSalesCells} />
            <Stat label={t('sales.yearlyImportPage.statValid')} value={preview.previewTotals.validEntries} />
            <Stat label={t('sales.yearlyImportPage.statInvalid')} value={preview.previewTotals.invalidEntries} danger />
            <Stat label={t('sales.yearlyImportPage.statInserts')} value={preview.previewTotals.inserts} success />
            <Stat label={t('sales.yearlyImportPage.statUpdates')} value={preview.previewTotals.updates} warn />
            <Stat label={t('sales.yearlyImportPage.statSkipped')} value={preview.previewTotals.skippedBlanks} />
            <Stat
              label={t('sales.yearlyImportPage.statWarnings')}
              value={preview.previewTotals.warningCount}
              warn
            />
          </div>
          {preview.previewTotals.unmappedEmployees.length > 0 && (
            <p className="text-xs text-amber-800">
              {t('sales.yearlyImportPage.unmappedList')}:{' '}
              {preview.previewTotals.unmappedEmployees.join(', ')}
            </p>
          )}
          <div className="space-y-3 border-t border-border pt-4">
            <div className="flex flex-wrap gap-2">
              {filterButtons.map((btn) => (
                <Button
                  key={btn.id}
                  variant={previewFilter === btn.id ? 'primary' : 'secondary'}
                  onClick={() => setPreviewFilter(btn.id)}
                  className="!h-8 !px-3 !text-xs"
                >
                  {btn.label}
                </Button>
              ))}
            </div>
            {filteredRows.length === 0 ? (
              <p className="text-sm text-muted">{t('sales.yearlyImportPage.noPreviewRows')}</p>
            ) : (
              <DataTable variant="luxury" zebra>
                <DataTableHead>
                  <DataTableTh>{t('sales.yearlyImportPage.colDate')}</DataTableTh>
                  <DataTableTh>{t('sales.yearlyImportPage.colEmployee')}</DataTableTh>
                  <DataTableTh>{t('sales.yearlyImportPage.colAmount')}</DataTableTh>
                  <DataTableTh>{t('sales.yearlyImportPage.colUploadedBoutique')}</DataTableTh>
                  <DataTableTh>{t('sales.yearlyImportPage.colHistoricalBoutique')}</DataTableTh>
                  <DataTableTh>{t('sales.yearlyImportPage.colCurrentBoutique')}</DataTableTh>
                  <DataTableTh>{t('sales.yearlyImportPage.colCurrent')}</DataTableTh>
                  <DataTableTh>{t('sales.yearlyImportPage.colNew')}</DataTableTh>
                  <DataTableTh>{t('sales.yearlyImportPage.colAction')}</DataTableTh>
                  <DataTableTh>{t('sales.yearlyImportPage.colWarnings')}</DataTableTh>
                </DataTableHead>
                <DataTableBody>
                  {filteredRows.map((row, idx) => (
                    <tr key={`${row.saleDate}-${row.empId}-${idx}`}>
                      <DataTableTd>{row.saleDate}</DataTableTd>
                      <DataTableTd>
                        <div className="font-medium">{row.employeeName}</div>
                        <div className="text-xs text-muted">{row.empId}</div>
                      </DataTableTd>
                      <DataTableTd>{formatAmount(row.amount)}</DataTableTd>
                      <DataTableTd className="text-xs">{row.uploadedBoutiqueName ?? row.uploadedBoutiqueId}</DataTableTd>
                      <DataTableTd className="text-xs">
                        {row.historicalBoutiqueName ?? row.historicalBoutiqueId ?? '—'}
                      </DataTableTd>
                      <DataTableTd className="text-xs">
                        {row.currentBoutiqueName ?? row.currentBoutiqueId ?? '—'}
                      </DataTableTd>
                      <DataTableTd>{formatAmount(row.currentAmount)}</DataTableTd>
                      <DataTableTd>{formatAmount(row.newAmount)}</DataTableTd>
                      <DataTableTd>
                        <Badge variant={actionBadgeVariant(row.action)}>{row.action}</Badge>
                      </DataTableTd>
                      <DataTableTd className="max-w-xs text-xs text-amber-800">
                        {row.warnings.length > 0 ? row.warnings.join(' ') : '—'}
                      </DataTableTd>
                    </tr>
                  ))}
                </DataTableBody>
              </DataTable>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  success,
  warn,
  danger,
}: {
  label: string;
  value: number;
  success?: boolean;
  warn?: boolean;
  danger?: boolean;
}) {
  const color = danger ? 'text-red-700' : warn ? 'text-amber-700' : success ? 'text-green-700' : '';
  return (
    <div className="rounded border border-border p-2">
      <span className="text-muted">{label}</span>
      <p className={`font-medium ${color}`}>{value}</p>
    </div>
  );
}
