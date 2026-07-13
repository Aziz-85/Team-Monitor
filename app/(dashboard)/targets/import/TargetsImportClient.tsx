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
import type { ImportRowAction } from '@/lib/targets/importPreview';

type ImportType = 'boutique' | 'employee';
type PreviewFilter = 'all' | 'insert' | 'update' | 'no_change' | 'skipped' | 'errors';

type PreviewTotals = {
  totalRows: number;
  willInsert: number;
  willUpdate: number;
  noChange: number;
  skipped: number;
  errors: number;
};

type BoutiquePreviewRow = {
  rowNumber: number;
  month: string;
  boutiqueCode: string;
  boutiqueName: string;
  existingAmount: number | null;
  newAmount: number | null;
  action: ImportRowAction;
  reason: string | null;
  status: string;
};

type EmployeePreviewRow = {
  rowNumber: number;
  month: string;
  empId: string;
  employeeName: string;
  role: string | null;
  boutiqueName: string;
  existingAmount: number | null;
  newAmount: number | null;
  action: ImportRowAction;
  reason: string | null;
  status: string;
};

type Preview = {
  totalRows: number;
  validRows: unknown[];
  invalidRows: { rowIndex: number; message: string }[];
  duplicateKeys: string[];
  inserts: unknown[];
  updates: unknown[];
  unresolvedBoutiques?: string[];
  unresolvedEmployees?: string[];
  sumMismatchWarnings?: { month: string; boutiqueId: string; boutiqueSum: number; employeeSum: number }[];
  previewRows?: BoutiquePreviewRow[] | EmployeePreviewRow[];
  previewTotals?: PreviewTotals;
};

function formatAmount(value: number | null | undefined): string {
  if (value == null) return '—';
  return value.toLocaleString('en-US');
}

function actionBadgeVariant(action: ImportRowAction): 'success' | 'warning' | 'neutral' | 'danger' {
  if (action === 'INSERT') return 'success';
  if (action === 'UPDATE') return 'warning';
  if (action === 'ERROR') return 'danger';
  return 'neutral';
}

function actionLabel(action: ImportRowAction, t: (key: string) => string): string {
  switch (action) {
    case 'INSERT':
      return t('targetsManagement.actionInsert');
    case 'UPDATE':
      return t('targetsManagement.actionUpdate');
    case 'NO_CHANGE':
      return t('targetsManagement.actionNoChange');
    case 'SKIPPED':
      return t('targetsManagement.actionSkipped');
    default:
      return t('targetsManagement.actionError');
  }
}

function matchesFilter(action: ImportRowAction, filter: PreviewFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'insert') return action === 'INSERT';
  if (filter === 'update') return action === 'UPDATE';
  if (filter === 'no_change') return action === 'NO_CHANGE';
  if (filter === 'skipped') return action === 'SKIPPED';
  return action === 'ERROR';
}

export function TargetsImportClient() {
  const { t } = useT();
  const [importType, setImportType] = useState<ImportType>('boutique');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [applyPlan, setApplyPlan] = useState<{ inserts: unknown[]; updates: unknown[] } | null>(null);
  const [fileSha256, setFileSha256] = useState<string | null>(null);
  const [previewFilter, setPreviewFilter] = useState<PreviewFilter>('all');
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<{ inserted: number; updated: number } | null>(null);
  const [canImport, setCanImport] = useState(false);
  const [templateMonth, setTemplateMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [scopeLabel, setScopeLabel] = useState<string | null>(null);

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

  const filteredPreviewRows = useMemo(() => {
    if (!preview?.previewRows) return [];
    return preview.previewRows.filter((row) => matchesFilter(row.action, previewFilter));
  }, [preview?.previewRows, previewFilter]);

  const downloadTemplate = (type: 'boutique' | 'employee') => {
    if (!/^\d{4}-\d{2}$/.test(templateMonth.trim())) return;
    const base =
      type === 'boutique' ? '/api/targets/template/boutique' : '/api/targets/template/employee';
    const url = `${base}?month=${encodeURIComponent(templateMonth.trim())}`;
    window.open(url, '_blank');
  };

  const runPreview = async () => {
    if (!file) return;
    setLoading(true);
    setPreview(null);
    setApplyPlan(null);
    setFileSha256(null);
    setApplyResult(null);
    setPreviewFilter('all');
    const formData = new FormData();
    formData.set('file', file);
    const url =
      importType === 'boutique'
        ? '/api/targets/import/boutiques/preview'
        : '/api/targets/import/employees/preview';
    try {
      const res = await fetch(url, { method: 'POST', body: formData, credentials: 'include' });
      const data = await res.json();
      setPreview(data);
      setApplyPlan({ inserts: data.inserts ?? [], updates: data.updates ?? [] });
      setFileSha256(typeof data.fileSha256 === 'string' ? data.fileSha256 : null);
      const totals = data.previewTotals as PreviewTotals | undefined;
      const hasWrites = (totals?.willInsert ?? 0) > 0 || (totals?.willUpdate ?? 0) > 0;
      const duplicateBlocked = data.applyBlockedByDuplicate === true;
      setCanImport(
        !duplicateBlocked &&
          (totals?.errors ?? data.invalidRows?.length ?? 0) === 0 &&
          hasWrites
      );
    } catch {
      setPreview(null);
      setApplyPlan(null);
      setFileSha256(null);
      setCanImport(false);
    } finally {
      setLoading(false);
    }
  };

  const runApply = async () => {
    if (!applyPlan || !canImport) return;
    setApplying(true);
    const formData = new FormData();
    formData.set('applyPlan', JSON.stringify(applyPlan));
    if (fileSha256) formData.set('fileSha256', fileSha256);
    const url =
      importType === 'boutique'
        ? '/api/targets/import/boutiques/apply'
        : '/api/targets/import/employees/apply';
    try {
      const res = await fetch(url, { method: 'POST', body: formData, credentials: 'include' });
      const data = await res.json();
      if (res.ok) {
        setApplyResult({ inserted: data.inserted ?? 0, updated: data.updated ?? 0 });
        setPreview(null);
        setApplyPlan(null);
        setFileSha256(null);
        setCanImport(false);
        setFile(null);
      } else {
        setApplyResult(null);
        setPreview((p) => (p ? { ...p, invalidRows: data.invalidRows ?? p.invalidRows } : null));
      }
    } finally {
      setApplying(false);
    }
  };

  const filterButtons: { id: PreviewFilter; label: string }[] = [
    { id: 'all', label: t('targetsManagement.previewFilterAll') },
    { id: 'insert', label: t('targetsManagement.previewFilterInserts') },
    { id: 'update', label: t('targetsManagement.previewFilterUpdates') },
    { id: 'no_change', label: t('targetsManagement.previewFilterNoChange') },
    { id: 'skipped', label: t('targetsManagement.previewFilterSkipped') },
    { id: 'errors', label: t('targetsManagement.previewFilterErrors') },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/targets" className="text-sm text-muted hover:text-foreground">
          ← {t('targetsManagement.title')}
        </Link>
      </div>
      <PageHeader
        title={t('targetsManagement.importExport')}
        subtitle={t('targetsManagement.templateDownload')}
      />

      <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
        <h3 className="mb-2 text-sm font-semibold text-foreground">{t('targetsManagement.templateDownload')}</h3>
        {scopeLabel ? (
          <p className="mb-3 text-xs text-muted">
            {t('targetsManagement.currentBoutiqueScope')}: <span className="font-medium text-foreground">{scopeLabel}</span>
          </p>
        ) : null}
        <p className="mb-3 text-xs text-muted">{t('targetsManagement.templateScopeHelper')}</p>
        <label className="mb-3 block text-xs text-muted">
          {t('targetsManagement.templateMonth')}
          <input
            type="month"
            value={templateMonth}
            onChange={(e) => setTemplateMonth(e.target.value)}
            className="mt-1 block h-10 w-full max-w-xs rounded-md border border-border bg-surface px-3 text-sm text-foreground"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => downloadTemplate('boutique')}>
            {t('targetsManagement.downloadBoutiqueTemplate')}
          </Button>
          <Button variant="secondary" onClick={() => downloadTemplate('employee')}>
            {t('targetsManagement.downloadEmployeeTemplate')}
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 text-sm text-amber-900">
        <p>{t('targetsManagement.columnsSameOrder')}</p>
        <p>{t('targetsManagement.monthFormat')}</p>
        <p>{t('targetsManagement.targetInteger')}</p>
        <p>{t('targetsManagement.outOfScopeRejected')}</p>
      </div>

      <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-foreground">{t('targetsManagement.uploadFile')}</h3>
        <div className="flex flex-wrap items-end gap-3">
          <select
            value={importType}
            onChange={(e) => {
              setImportType(e.target.value as ImportType);
              setPreview(null);
              setApplyPlan(null);
              setFile(null);
              setCanImport(false);
            }}
            className="h-10 rounded-md border border-border bg-surface px-3 text-sm text-foreground"
          >
            <option value="boutique">{t('targetsManagement.boutiqueTargets')}</option>
            <option value="employee">{t('targetsManagement.employeeTargets')}</option>
          </select>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setPreview(null);
              setApplyPlan(null);
              setCanImport(false);
            }}
            className="text-sm text-foreground"
          />
          <Button variant="primary" onClick={runPreview} disabled={!file || loading}>
            {loading ? t('common.loading') : t('targetsManagement.dryRun')}
          </Button>
          <Button variant="primary" onClick={runApply} disabled={!canImport || applying}>
            {applying ? t('common.loading') : t('targetsManagement.confirmApply')}
          </Button>
        </div>
      </div>

      {applyResult && (
        <div className="rounded-lg border border-border bg-surface p-4 shadow-sm text-sm text-foreground">
          <p className="font-medium">{t('targetsManagement.importSuccess')}</p>
          <p>
            {t('targetsManagement.inserts')}: {applyResult.inserted} · {t('targetsManagement.updates')}: {applyResult.updated}
          </p>
        </div>
      )}

      {preview && (
        <div className="space-y-4 rounded-lg border border-border bg-surface p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-foreground">Preview</h3>
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3 lg:grid-cols-6">
            <div className="rounded border border-border p-2">
              <span className="text-muted">{t('targetsManagement.previewTotalRows')}</span>
              <p className="font-medium">{preview.previewTotals?.totalRows ?? preview.totalRows}</p>
            </div>
            <div className="rounded border border-border p-2">
              <span className="text-muted">{t('targetsManagement.previewWillInsert')}</span>
              <p className="font-medium text-green-700">{preview.previewTotals?.willInsert ?? preview.inserts?.length ?? 0}</p>
            </div>
            <div className="rounded border border-border p-2">
              <span className="text-muted">{t('targetsManagement.previewWillUpdate')}</span>
              <p className="font-medium text-amber-700">{preview.previewTotals?.willUpdate ?? preview.updates?.length ?? 0}</p>
            </div>
            <div className="rounded border border-border p-2">
              <span className="text-muted">{t('targetsManagement.previewNoChange')}</span>
              <p className="font-medium">{preview.previewTotals?.noChange ?? 0}</p>
            </div>
            <div className="rounded border border-border p-2">
              <span className="text-muted">{t('targetsManagement.previewSkipped')}</span>
              <p className="font-medium">{preview.previewTotals?.skipped ?? 0}</p>
            </div>
            <div className="rounded border border-border p-2">
              <span className="text-muted">{t('targetsManagement.previewErrors')}</span>
              <p className="font-medium text-red-700">{preview.previewTotals?.errors ?? preview.invalidRows?.length ?? 0}</p>
            </div>
          </div>

          {preview.sumMismatchWarnings && preview.sumMismatchWarnings.length > 0 && (
            <div className="rounded border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900">
              <p className="font-medium">{t('targetsManagement.sumMismatch')}</p>
              <ul className="list-disc pl-4">
                {preview.sumMismatchWarnings.map((w, i) => (
                  <li key={i}>
                    {w.month} · Boutique sum: {w.boutiqueSum} · Employee sum: {w.employeeSum}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-3 border-t border-border pt-4">
            <div>
              <h4 className="text-sm font-semibold text-foreground">{t('targetsManagement.previewDetails')}</h4>
              <p className="mt-1 text-xs text-muted">{t('targetsManagement.previewApplyHint')}</p>
            </div>
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
            {filteredPreviewRows.length === 0 ? (
              <p className="text-sm text-muted">{t('targetsManagement.noPreviewRows')}</p>
            ) : (
              <DataTable variant="luxury" zebra>
                <DataTableHead>
                  <DataTableTh>{t('targetsManagement.previewColRow')}</DataTableTh>
                  <DataTableTh>{t('targetsManagement.previewColMonth')}</DataTableTh>
                  <DataTableTh>{t('targetsManagement.previewColScopeEmployee')}</DataTableTh>
                  <DataTableTh>{t('targetsManagement.previewColCurrentTarget')}</DataTableTh>
                  <DataTableTh>{t('targetsManagement.previewColNewTarget')}</DataTableTh>
                  <DataTableTh>{t('targetsManagement.previewColAction')}</DataTableTh>
                  <DataTableTh>{t('targetsManagement.previewColStatus')}</DataTableTh>
                </DataTableHead>
                <DataTableBody>
                  {importType === 'boutique'
                    ? (filteredPreviewRows as BoutiquePreviewRow[]).map((row) => (
                        <tr key={`b-${row.rowNumber}`}>
                          <DataTableTd>{row.rowNumber}</DataTableTd>
                          <DataTableTd>{row.month}</DataTableTd>
                          <DataTableTd>
                            <div className="font-medium">{row.boutiqueName}</div>
                            <div className="text-xs text-muted">{row.boutiqueCode}</div>
                          </DataTableTd>
                          <DataTableTd>{formatAmount(row.existingAmount)}</DataTableTd>
                          <DataTableTd>{formatAmount(row.newAmount)}</DataTableTd>
                          <DataTableTd>
                            <Badge variant={actionBadgeVariant(row.action)}>{actionLabel(row.action, t)}</Badge>
                          </DataTableTd>
                          <DataTableTd className="text-xs">{row.status}</DataTableTd>
                        </tr>
                      ))
                    : (filteredPreviewRows as EmployeePreviewRow[]).map((row) => (
                        <tr key={`e-${row.rowNumber}`}>
                          <DataTableTd>{row.rowNumber}</DataTableTd>
                          <DataTableTd>{row.month}</DataTableTd>
                          <DataTableTd>
                            <div className="font-medium">{row.employeeName}</div>
                            <div className="text-xs text-muted">
                              {row.empId}
                              {row.role ? ` · ${row.role}` : ''}
                            </div>
                            <div className="text-xs text-muted">{row.boutiqueName}</div>
                          </DataTableTd>
                          <DataTableTd>{formatAmount(row.existingAmount)}</DataTableTd>
                          <DataTableTd>{formatAmount(row.newAmount)}</DataTableTd>
                          <DataTableTd>
                            <Badge variant={actionBadgeVariant(row.action)}>{actionLabel(row.action, t)}</Badge>
                          </DataTableTd>
                          <DataTableTd className="text-xs">{row.status}</DataTableTd>
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
