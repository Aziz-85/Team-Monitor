'use client';

import { useState, useRef } from 'react';
import { OpsCard } from '@/components/ui/OpsCard';

function getCurrentMonthRiyadh(): string {
  const d = new Date();
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit' });
  const parts = fmt.formatToParts(d);
  const year = parts.find((p) => p.type === 'year')?.value ?? '';
  const month = parts.find((p) => p.type === 'month')?.value ?? '';
  return `${year}-${month}`;
}

type PreviewResult = {
  dryRun?: boolean;
  month?: string;
  scopeId?: string;
  sheetName?: string;
  mappedEmployees?: { colIndex: number; headerRaw: string; employeeId: string; employeeName: string }[];
  unmappedEmployees?: { colIndex: number; headerRaw: string; normalized: string }[];
  inserted?: number;
  updated?: number;
  skippedEmpty?: number;
  applyAllowed?: boolean;
  applyBlockReasons?: string[];
  blockingErrorsCount?: number;
  blockingErrors?: { type: string; message: string; row: number; col: number; headerRaw?: string; value?: unknown }[];
  sampleNonBlankCells?: { row: number; col: number; headerRaw: string; value: unknown }[];
  diagnostic?: { employeeStartCol?: number; employeeEndCol?: number; totalRows?: number; totalCols?: number };
  error?: string;
};

export function SalesImportClient() {
  const [templateMonth, setTemplateMonth] = useState(() => getCurrentMonthRiyadh());
  const [templateLoading, setTemplateLoading] = useState(false);

  const [importFile, setImportFile] = useState<File | null>(null);
  const [importMonth, setImportMonth] = useState(() => getCurrentMonthRiyadh());
  const [importIncludePrevious, setImportIncludePrevious] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importPreviewResult, setImportPreviewResult] = useState<PreviewResult | null>(null);
  const [importApplyLoading, setImportApplyLoading] = useState(false);
  const importFileInputRef = useRef<HTMLInputElement>(null);

  const [exportMonth, setExportMonth] = useState(() => getCurrentMonthRiyadh());
  const [exportIncludePrevious, setExportIncludePrevious] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);

  const downloadTemplate = async () => {
    if (!/^\d{4}-\d{2}$/.test(templateMonth.trim())) return;
    setTemplateLoading(true);
    try {
      const res = await fetch(`/api/sales/import/template?month=${encodeURIComponent(templateMonth.trim())}`, { cache: 'no-store' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error ?? 'Failed to download template');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Matrix_Template_${templateMonth}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setTemplateLoading(false);
    }
  };

  const runPreview = async () => {
    if (!importFile || !importMonth.trim()) return;
    setImportLoading(true);
    setImportPreviewResult(null);
    try {
      const form = new FormData();
      form.set('file', importFile);
      form.set('month', importMonth.trim());
      form.set('includePreviousMonth', importIncludePrevious ? 'true' : 'false');
      const res = await fetch('/api/sales/import/preview', { method: 'POST', body: form });
      const j = await res.json();
      if (!res.ok) {
        setImportPreviewResult({ error: j.error ?? 'Preview failed', ...j });
        return;
      }
      setImportPreviewResult(j);
    } catch {
      setImportPreviewResult({ error: 'Request failed' });
    } finally {
      setImportLoading(false);
    }
  };

  const runApply = async () => {
    if (!importFile || !importMonth.trim() || (importPreviewResult && !importPreviewResult.applyAllowed)) return;
    setImportApplyLoading(true);
    try {
      const form = new FormData();
      form.set('file', importFile);
      form.set('month', importMonth.trim());
      form.set('includePreviousMonth', importIncludePrevious ? 'true' : 'false');
      const res = await fetch('/api/sales/import/apply', { method: 'POST', body: form });
      const j = await res.json();
      if (!res.ok) {
        setImportPreviewResult((prev) => ({ ...prev, error: j.error ?? 'Apply failed', applyAllowed: false }));
        return;
      }
      setImportPreviewResult((prev) => ({
        ...prev,
        ...j,
        dryRun: false,
        applyAllowed: true,
        blockingErrorsCount: 0,
        blockingErrors: [],
      }));
    } catch {
      setImportPreviewResult((prev) => (prev ? { ...prev, error: 'Request failed' } : { error: 'Request failed' }));
    } finally {
      setImportApplyLoading(false);
    }
  };

  const runExport = async () => {
    if (!/^\d{4}-\d{2}$/.test(exportMonth.trim())) return;
    setExportLoading(true);
    try {
      const params = new URLSearchParams({
        month: exportMonth.trim(),
        includePreviousMonth: exportIncludePrevious ? 'true' : 'false',
      });
      const res = await fetch(`/api/sales/import/export?${params}`, { cache: 'no-store' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error ?? 'Export failed');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Sales_Matrix_Export_${exportMonth}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExportLoading(false);
    }
  };

  return (
    <div className="overflow-x-hidden p-4 md:p-6">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-4 text-xl font-semibold text-slate-900">Sales Import</h1>

        {/* 1) Template */}
        <OpsCard className="mb-6">
          <h3 className="mb-2 border-b border-slate-200 pb-2 text-sm font-medium text-slate-900">Template</h3>
          <p className="mb-3 text-xs text-slate-500">
            Download an Excel template (DATA_MATRIX sheet) with days and employee columns for the selected month.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mr-1 text-xs text-slate-500">Month (YYYY-MM)</label>
              <input
                type="text"
                placeholder="YYYY-MM"
                value={templateMonth}
                onChange={(e) => setTemplateMonth(e.target.value)}
                className="w-28 rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900"
              />
            </div>
            <button
              type="button"
              disabled={!templateMonth.trim() || templateLoading}
              onClick={downloadTemplate}
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {templateLoading ? '…' : 'Download Template'}
            </button>
          </div>
        </OpsCard>

        {/* 2) Import */}
        <OpsCard className="mb-6">
          <h3 className="mb-2 border-b border-slate-200 pb-2 text-sm font-medium text-slate-900">Import</h3>
          <p className="mb-3 text-xs text-slate-500">
            Upload .xlsx with DATA_MATRIX sheet. Preview (dry run) first; Apply writes to DB when there are no blocking errors.
          </p>
          <input
            ref={importFileInputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              setImportFile(f ?? null);
              setImportPreviewResult(null);
              e.target.value = '';
            }}
          />
          <div className="flex flex-wrap items-end gap-3">
            <button
              type="button"
              onClick={() => importFileInputRef.current?.click()}
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              {importFile ? importFile.name : 'Choose .xlsx file'}
            </button>
            <div>
              <label className="mr-1 text-xs text-slate-500">Month (YYYY-MM)</label>
              <input
                type="text"
                placeholder="YYYY-MM"
                value={importMonth}
                onChange={(e) => setImportMonth(e.target.value)}
                className="w-28 rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900"
              />
            </div>
            <label className="flex items-center gap-1.5 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={importIncludePrevious}
                onChange={(e) => setImportIncludePrevious(e.target.checked)}
              />
              Include previous month
            </label>
            <button
              type="button"
              disabled={!importFile || !importMonth.trim() || importLoading}
              onClick={runPreview}
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {importLoading ? '…' : 'Preview'}
            </button>
            <button
              type="button"
              disabled={
                !importFile ||
                !importMonth.trim() ||
                importApplyLoading ||
                (importPreviewResult != null && !importPreviewResult.applyAllowed)
              }
              onClick={runApply}
              className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            >
              {importApplyLoading ? '…' : 'Apply'}
            </button>
          </div>

          {importPreviewResult && (
            <div className="mt-4 space-y-2">
              {importPreviewResult.error && (
                <p className="text-sm text-red-600">{importPreviewResult.error}</p>
              )}
              {importPreviewResult.applyAllowed === false && importPreviewResult.applyBlockReasons?.length ? (
                <p className="text-sm text-amber-600">
                  Apply blocked: {importPreviewResult.applyBlockReasons.join(', ')}
                </p>
              ) : null}
              {importPreviewResult.blockingErrorsCount ? (
                <>
                  <p className="text-sm text-red-600">Blocking errors: {importPreviewResult.blockingErrorsCount}</p>
                  <div className="max-h-48 overflow-auto rounded border border-red-200 bg-red-50 p-2">
                    <table className="w-full border-collapse text-xs text-red-800">
                      <thead>
                        <tr className="text-left">
                          <th className="pr-2">Row</th>
                          <th className="pr-2">Col</th>
                          <th className="pr-2">Type</th>
                          <th>Message</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(importPreviewResult.blockingErrors ?? []).slice(0, 50).map((err, i) => (
                          <tr key={i}>
                            <td className="pr-2">{err.row}</td>
                            <td className="pr-2">{err.col}</td>
                            <td className="pr-2">{err.type}</td>
                            <td>{err.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}
              <div className="rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-800">
                <p>Mapped employees: {importPreviewResult.mappedEmployees?.length ?? 0}</p>
                <p>Unmapped employees: {importPreviewResult.unmappedEmployees?.length ?? 0}</p>
                <p>Inserted: {importPreviewResult.inserted ?? 0} · Updated: {importPreviewResult.updated ?? 0} · Skipped empty: {importPreviewResult.skippedEmpty ?? 0}</p>
                {importPreviewResult.diagnostic && (
                  <p>Cols: {importPreviewResult.diagnostic.employeeStartCol}–{importPreviewResult.diagnostic.employeeEndCol} · Rows: {importPreviewResult.diagnostic.totalRows} · Total cols: {importPreviewResult.diagnostic.totalCols}</p>
                )}
                {importPreviewResult.sampleNonBlankCells && importPreviewResult.sampleNonBlankCells.length > 0 && (
                  <details className="mt-2">
                    <summary>Sample non-blank cells (up to 12)</summary>
                    <pre className="mt-1 max-h-32 overflow-auto">
                      {JSON.stringify(importPreviewResult.sampleNonBlankCells.slice(0, 12), null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            </div>
          )}
        </OpsCard>

        {/* 3) Export */}
        <OpsCard className="mb-6">
          <h3 className="mb-2 border-b border-slate-200 pb-2 text-sm font-medium text-slate-900">Export</h3>
          <p className="mb-3 text-xs text-slate-500">
            Export sales from DB to Excel in the same DATA_MATRIX format as the template.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mr-1 text-xs text-slate-500">Month (YYYY-MM)</label>
              <input
                type="text"
                placeholder="YYYY-MM"
                value={exportMonth}
                onChange={(e) => setExportMonth(e.target.value)}
                className="w-28 rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900"
              />
            </div>
            <label className="flex items-center gap-1.5 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={exportIncludePrevious}
                onChange={(e) => setExportIncludePrevious(e.target.checked)}
              />
              Include previous month
            </label>
            <button
              type="button"
              disabled={!exportMonth.trim() || exportLoading}
              onClick={runExport}
              className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            >
              {exportLoading ? '…' : 'Export DB to Excel'}
            </button>
          </div>
        </OpsCard>
      </div>
    </div>
  );
}
