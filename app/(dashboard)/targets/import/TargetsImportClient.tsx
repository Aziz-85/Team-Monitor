'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useT } from '@/lib/i18n/useT';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import {
  DataTable,
  DataTableHead,
  DataTableTh,
  DataTableBody,
  DataTableTd,
} from '@/components/ui/DataTable';

type ImportType = 'boutique' | 'employee';
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
};

export function TargetsImportClient() {
  const { t } = useT();
  const [importType, setImportType] = useState<ImportType>('boutique');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<{ inserted: number; updated: number } | null>(null);
  const [canImport, setCanImport] = useState(false);

  const downloadTemplate = (type: 'boutique' | 'employee') => {
    const url = type === 'boutique' ? '/api/targets/template/boutiques' : '/api/targets/template/employees';
    window.open(url, '_blank');
  };

  const runPreview = async () => {
    if (!file) return;
    setLoading(true);
    setPreview(null);
    setApplyResult(null);
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
      setCanImport(data.invalidRows?.length === 0 && (data.inserts?.length > 0 || data.updates?.length > 0));
    } catch {
      setPreview(null);
      setCanImport(false);
    } finally {
      setLoading(false);
    }
  };

  const runApply = async () => {
    if (!file || !canImport) return;
    setApplying(true);
    const formData = new FormData();
    formData.set('file', file);
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

  return (
    <div className="mx-auto max-w-4xl space-y-6">
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
        <div className="flex gap-2">
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
              setCanImport(false);
            }}
            className="text-sm text-foreground"
          />
          <Button variant="primary" onClick={runPreview} disabled={!file || loading}>
            {loading ? t('common.loading') : t('targetsManagement.dryRun')}
          </Button>
          <Button
            variant="primary"
            onClick={runApply}
            disabled={!canImport || applying}
          >
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
        <div className="space-y-3 rounded-lg border border-border bg-surface p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-foreground">Preview</h3>
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div className="rounded border border-border p-2">
              <span className="text-muted">Total</span>
              <p className="font-medium">{preview.totalRows}</p>
            </div>
            <div className="rounded border border-border p-2">
              <span className="text-muted">{t('targetsManagement.validRows')}</span>
              <p className="font-medium">{preview.validRows?.length ?? 0}</p>
            </div>
            <div className="rounded border border-border p-2">
              <span className="text-muted">{t('targetsManagement.invalidRows')}</span>
              <p className="font-medium">{preview.invalidRows?.length ?? 0}</p>
            </div>
            <div className="rounded border border-border p-2">
              <span className="text-muted">{t('targetsManagement.inserts')} / {t('targetsManagement.updates')}</span>
              <p className="font-medium">{preview.inserts?.length ?? 0} / {preview.updates?.length ?? 0}</p>
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
          {preview.invalidRows && preview.invalidRows.length > 0 && (
            <DataTable variant="luxury" zebra>
              <DataTableHead>
                <DataTableTh>Row</DataTableTh>
                <DataTableTh>Message</DataTableTh>
              </DataTableHead>
              <DataTableBody>
                {preview.invalidRows.map((err, i) => (
                  <tr key={i}>
                    <DataTableTd>{err.rowIndex}</DataTableTd>
                    <DataTableTd>{err.message}</DataTableTd>
                  </tr>
                ))}
              </DataTableBody>
            </DataTable>
          )}
        </div>
      )}
    </div>
  );
}
