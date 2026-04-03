'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { OpsCard } from '@/components/ui/OpsCard';
import { Button } from '@/components/ui/Button';
import { FeedbackBanner } from '@/components/ui/FeedbackBanner';
import { PageContainer, SectionBlock } from '@/components/ui/ExecutiveIntelligence';
import { useT } from '@/lib/i18n/useT';

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

export type SalesImportClientProps = {
  /** When true, skip page chrome (used inside admin import tabs). */
  embedded?: boolean;
};

export function SalesImportClient({ embedded = false }: SalesImportClientProps) {
  const { t } = useT();
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
  const [templateBanner, setTemplateBanner] = useState<{ variant: 'error' | 'success'; message: string } | null>(null);
  const [exportBanner, setExportBanner] = useState<{ variant: 'error' | 'success'; message: string } | null>(null);

  const downloadTemplate = async () => {
    if (!/^\d{4}-\d{2}$/.test(templateMonth.trim())) return;
    setTemplateLoading(true);
    setTemplateBanner(null);
    try {
      const res = await fetch(`/api/sales/import/template?month=${encodeURIComponent(templateMonth.trim())}`, { cache: 'no-store' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setTemplateBanner({
          variant: 'error',
          message: String((j as { error?: string }).error ?? t('sales.importTool.templateExportFailed')),
        });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Matrix_Template_${templateMonth}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      setTemplateBanner({ variant: 'success', message: t('sales.importTool.templateDownloaded') });
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
    setExportBanner(null);
    try {
      const params = new URLSearchParams({
        month: exportMonth.trim(),
        includePreviousMonth: exportIncludePrevious ? 'true' : 'false',
      });
      const res = await fetch(`/api/sales/import/export?${params}`, { cache: 'no-store' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setExportBanner({
          variant: 'error',
          message: String((j as { error?: string }).error ?? t('sales.importTool.templateExportFailed')),
        });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Sales_Matrix_Export_${exportMonth}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      setExportBanner({ variant: 'success', message: t('sales.importTool.exportDownloaded') });
    } finally {
      setExportLoading(false);
    }
  };

  const inner = (
    <div className={`mx-auto min-w-0 ${embedded ? '' : 'max-w-4xl'}`}>
      <OpsCard className="mb-6">
        <h3 className="mb-2 border-b border-border pb-2 text-sm font-medium text-foreground">
          {t('sales.importTool.templateTitle')}
        </h3>
        <p className="mb-3 text-xs text-muted">{t('sales.importTool.templateHint')}</p>
        {templateBanner != null && (
          <FeedbackBanner
            variant={templateBanner.variant}
            message={templateBanner.message}
            className="mb-3"
            onDismiss={() => setTemplateBanner(null)}
          />
        )}
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="me-1 text-xs text-muted">{t('sales.importTool.monthYm')}</label>
            <input
              type="text"
              placeholder="YYYY-MM"
              value={templateMonth}
              onChange={(e) => setTemplateMonth(e.target.value)}
              className="w-28 rounded border border-border bg-surface px-2 py-1 text-sm text-foreground"
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            disabled={!templateMonth.trim() || templateLoading}
            onClick={downloadTemplate}
            className="h-9 px-3 text-sm"
          >
            {templateLoading ? t('sales.importTool.loadingShort') : t('sales.importTool.downloadTemplate')}
          </Button>
        </div>
      </OpsCard>

      <OpsCard className="mb-6">
        <h3 className="mb-2 border-b border-border pb-2 text-sm font-medium text-foreground">
          {t('sales.importTool.importTitle')}
        </h3>
        <p className="mb-3 text-xs text-muted">{t('sales.importTool.importHint')}</p>
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
          <Button
            type="button"
            variant="secondary"
            onClick={() => importFileInputRef.current?.click()}
            className="h-9 px-3 text-sm"
          >
            {importFile ? importFile.name : t('sales.importTool.chooseFile')}
          </Button>
          <div>
            <label className="me-1 text-xs text-muted">{t('sales.importTool.monthYm')}</label>
            <input
              type="text"
              placeholder="YYYY-MM"
              value={importMonth}
              onChange={(e) => setImportMonth(e.target.value)}
              className="w-28 rounded border border-border bg-surface px-2 py-1 text-sm text-foreground"
            />
          </div>
          <label className="flex items-center gap-1.5 text-sm text-foreground">
            <input
              type="checkbox"
              checked={importIncludePrevious}
              onChange={(e) => setImportIncludePrevious(e.target.checked)}
            />
            {t('sales.importTool.includePreviousMonth')}
          </label>
          <Button
            type="button"
            variant="secondary"
            disabled={!importFile || !importMonth.trim() || importLoading}
            onClick={runPreview}
            className="h-9 px-3 text-sm"
          >
            {importLoading ? t('sales.importTool.loadingShort') : t('sales.importTool.preview')}
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={
              !importFile ||
              !importMonth.trim() ||
              importApplyLoading ||
              (importPreviewResult != null && !importPreviewResult.applyAllowed)
            }
            onClick={runApply}
            className="h-9 px-3 text-sm"
          >
            {importApplyLoading ? t('sales.importTool.loadingShort') : t('sales.importTool.apply')}
          </Button>
        </div>

        {importPreviewResult && (
          <div className="mt-4 space-y-2">
            {importPreviewResult.error && <p className="text-sm text-red-600">{importPreviewResult.error}</p>}
            {importPreviewResult.applyAllowed === false && importPreviewResult.applyBlockReasons?.length ? (
              <p className="text-sm text-amber-600">
                {t('sales.importTool.applyBlocked')} {importPreviewResult.applyBlockReasons.join(', ')}
              </p>
            ) : null}
            {importPreviewResult.blockingErrorsCount ? (
              <>
                <p className="text-sm text-red-600">
                  {t('sales.importTool.blockingErrors')} {importPreviewResult.blockingErrorsCount}
                </p>
                <div className="max-h-48 overflow-auto rounded border border-red-200 bg-red-50 p-2">
                  <table className="w-full border-collapse text-xs text-red-800">
                    <thead>
                      <tr className="text-start">
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
            <div className="rounded border border-border bg-surface-subtle p-2 text-xs text-foreground">
              <p>
                {t('sales.importTool.mappedEmployees')} {importPreviewResult.mappedEmployees?.length ?? 0}
              </p>
              <p>
                {t('sales.importTool.unmappedEmployees')} {importPreviewResult.unmappedEmployees?.length ?? 0}
              </p>
              <p>
                {t('sales.importTool.insertedUpdated')
                  .replace('{inserted}', String(importPreviewResult.inserted ?? 0))
                  .replace('{updated}', String(importPreviewResult.updated ?? 0))
                  .replace('{skipped}', String(importPreviewResult.skippedEmpty ?? 0))}
              </p>
              {importPreviewResult.diagnostic && (
                <p>
                  Cols: {importPreviewResult.diagnostic.employeeStartCol}–{importPreviewResult.diagnostic.employeeEndCol} · Rows:{' '}
                  {importPreviewResult.diagnostic.totalRows} · Total cols: {importPreviewResult.diagnostic.totalCols}
                </p>
              )}
              {importPreviewResult.sampleNonBlankCells && importPreviewResult.sampleNonBlankCells.length > 0 && (
                <details className="mt-2">
                  <summary>{t('sales.importTool.sampleCells')}</summary>
                  <pre className="mt-1 max-h-32 overflow-auto">
                    {JSON.stringify(importPreviewResult.sampleNonBlankCells.slice(0, 12), null, 2)}
                  </pre>
                </details>
              )}
            </div>
          </div>
        )}
      </OpsCard>

      <OpsCard className="mb-6">
        <h3 className="mb-2 border-b border-border pb-2 text-sm font-medium text-foreground">
          {t('sales.importTool.exportTitle')}
        </h3>
        <p className="mb-3 text-xs text-muted">{t('sales.importTool.exportHint')}</p>
        {exportBanner != null && (
          <FeedbackBanner
            variant={exportBanner.variant}
            message={exportBanner.message}
            className="mb-3"
            onDismiss={() => setExportBanner(null)}
          />
        )}
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="me-1 text-xs text-muted">{t('sales.importTool.monthYm')}</label>
            <input
              type="text"
              placeholder="YYYY-MM"
              value={exportMonth}
              onChange={(e) => setExportMonth(e.target.value)}
              className="w-28 rounded border border-border bg-surface px-2 py-1 text-sm text-foreground"
            />
          </div>
          <label className="flex items-center gap-1.5 text-sm text-foreground">
            <input
              type="checkbox"
              checked={exportIncludePrevious}
              onChange={(e) => setExportIncludePrevious(e.target.checked)}
            />
            {t('sales.importTool.includePreviousMonth')}
          </label>
          <Button
            type="button"
            variant="primary"
            disabled={!exportMonth.trim() || exportLoading}
            onClick={runExport}
            className="h-9 px-3 text-sm"
          >
            {exportLoading ? t('sales.importTool.loadingShort') : t('sales.importTool.exportDb')}
          </Button>
        </div>
      </OpsCard>
    </div>
  );

  if (embedded) {
    return <div className="min-w-0">{inner}</div>;
  }

  return (
    <PageContainer className="mx-auto max-w-6xl space-y-8 md:space-y-10">
      <SectionBlock
        title={t('sales.importTool.pageTitle')}
        subtitle={t('sales.importTool.pageSubtitle')}
        rightSlot={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/sales/daily"
              className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground/80 hover:bg-surface-subtle"
            >
              {t('sales.dailyLedger.pageTitle')}
            </Link>
            <Link
              href="/nav/analytics/sales"
              className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground/80 hover:bg-surface-subtle"
            >
              {t('common.back')}
            </Link>
          </div>
        }
      >
        {inner}
      </SectionBlock>
    </PageContainer>
  );
}
