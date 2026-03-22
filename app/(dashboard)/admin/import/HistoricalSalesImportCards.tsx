'use client';

import { useCallback, useState } from 'react';
import { useT } from '@/lib/i18n/useT';
import { OpsCard } from '@/components/ui/OpsCard';

type Props = {
  boutiqueId: string;
  year: string;
  onDownloadInitial: () => void;
  onDownloadCorrection: () => void;
};

export function HistoricalSalesImportCards({
  boutiqueId,
  year,
  onDownloadInitial,
  onDownloadCorrection,
}: Props) {
  const { t } = useT();
  const [fileInitial, setFileInitial] = useState<File | null>(null);
  const [fileCorrection, setFileCorrection] = useState<File | null>(null);
  const [reason, setReason] = useState('');
  const [dryInitial, setDryInitial] = useState(true);
  const [dryCorrection, setDryCorrection] = useState(true);
  const [loadingI, setLoadingI] = useState(false);
  const [loadingC, setLoadingC] = useState(false);
  const [resultI, setResultI] = useState<unknown>(null);
  const [resultC, setResultC] = useState<unknown>(null);
  const [errI, setErrI] = useState<string | null>(null);
  const [errC, setErrC] = useState<string | null>(null);

  const postInitial = useCallback(async () => {
    if (!boutiqueId || !fileInitial) return;
    setLoadingI(true);
    setErrI(null);
    setResultI(null);
    try {
      const fd = new FormData();
      fd.append('file', fileInitial);
      fd.append('boutiqueId', boutiqueId);
      fd.append('dryRun', dryInitial ? '1' : '0');
      const res = await fetch('/api/admin/import-center/historical-sales/initial', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) {
        setErrI(typeof data.error === 'string' ? data.error : JSON.stringify(data));
        return;
      }
      setResultI(data);
    } catch (e) {
      setErrI(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingI(false);
    }
  }, [boutiqueId, fileInitial, dryInitial]);

  const postCorrection = useCallback(async () => {
    if (!boutiqueId || !fileCorrection) return;
    setLoadingC(true);
    setErrC(null);
    setResultC(null);
    try {
      const fd = new FormData();
      fd.append('file', fileCorrection);
      fd.append('boutiqueId', boutiqueId);
      fd.append('reason', reason);
      fd.append('dryRun', dryCorrection ? '1' : '0');
      const res = await fetch('/api/admin/import-center/historical-sales/correction', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) {
        setErrC(typeof data.error === 'string' ? data.error : JSON.stringify(data));
        return;
      }
      setResultC(data);
    } catch (e) {
      setErrC(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingC(false);
    }
  }, [boutiqueId, fileCorrection, reason, dryCorrection]);

  const downloadCsv = (csv: string, name: string) => {
    if (!csv) return;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <OpsCard className="space-y-2 p-4">
        <h3 className="text-sm font-medium text-foreground">{t('admin.importCenter.histInitialTitle')}</h3>
        <p className="text-xs text-muted">{t('admin.importCenter.histInitialDesc')}</p>
        <p className="text-xs text-amber-700 dark:text-amber-300">{t('admin.importCenter.histInitialWarn')}</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!boutiqueId}
            className="rounded bg-foreground px-2 py-1 text-xs text-background disabled:opacity-50"
            onClick={onDownloadInitial}
          >
            {t('admin.importCenter.downloadTemplate')}
          </button>
        </div>
        <label className="block text-xs text-muted">
          {t('admin.importCenter.uploadFile')}
          <input
            type="file"
            accept=".xlsx,.xlsm"
            className="mt-1 w-full text-xs"
            onChange={(e) => setFileInitial(e.target.files?.[0] ?? null)}
          />
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={dryInitial} onChange={(e) => setDryInitial(e.target.checked)} />
          {t('admin.importCenter.dryRun')}
        </label>
        <button
          type="button"
          disabled={!boutiqueId || !fileInitial || loadingI}
          className="rounded border border-border px-2 py-1 text-xs disabled:opacity-50"
          onClick={postInitial}
        >
          {loadingI ? '…' : t('admin.importCenter.runImport')}
        </button>
        {errI ? <p className="text-xs text-red-600">{errI}</p> : null}
        {resultI ? (
          <div className="max-h-48 overflow-auto rounded border border-border bg-surface-subtle p-2 text-[10px] font-mono">
            <pre className="whitespace-pre-wrap">{JSON.stringify(resultI, null, 2)}</pre>
            {(resultI as { conflictReportCsv?: string }).conflictReportCsv ? (
              <button
                type="button"
                className="mt-2 text-xs underline"
                onClick={() =>
                  downloadCsv(
                    (resultI as { conflictReportCsv: string }).conflictReportCsv,
                    `historical-initial-${year}.csv`
                  )
                }
              >
                {t('admin.importCenter.downloadCsv')}
              </button>
            ) : null}
          </div>
        ) : null}
      </OpsCard>

      <OpsCard className="space-y-2 p-4">
        <h3 className="text-sm font-medium text-foreground">{t('admin.importCenter.histCorrectionTitle')}</h3>
        <p className="text-xs text-muted">{t('admin.importCenter.histCorrectionDesc')}</p>
        <p className="text-xs text-amber-700 dark:text-amber-300">{t('admin.importCenter.histCorrectionWarn')}</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!boutiqueId}
            className="rounded bg-foreground px-2 py-1 text-xs text-background disabled:opacity-50"
            onClick={onDownloadCorrection}
          >
            {t('admin.importCenter.downloadTemplate')}
          </button>
        </div>
        <label className="block text-xs text-muted">
          {t('admin.importCenter.correctionReason')}
          <textarea
            className="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-xs"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('admin.importCenter.correctionReasonPh')}
          />
        </label>
        <label className="block text-xs text-muted">
          {t('admin.importCenter.uploadFile')}
          <input
            type="file"
            accept=".xlsx,.xlsm"
            className="mt-1 w-full text-xs"
            onChange={(e) => setFileCorrection(e.target.files?.[0] ?? null)}
          />
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={dryCorrection} onChange={(e) => setDryCorrection(e.target.checked)} />
          {t('admin.importCenter.dryRun')}
        </label>
        <button
          type="button"
          disabled={!boutiqueId || !fileCorrection || loadingC}
          className="rounded border border-border px-2 py-1 text-xs disabled:opacity-50"
          onClick={postCorrection}
        >
          {loadingC ? '…' : t('admin.importCenter.runCorrection')}
        </button>
        {errC ? <p className="text-xs text-red-600">{errC}</p> : null}
        {resultC ? (
          <div className="max-h-48 overflow-auto rounded border border-border bg-surface-subtle p-2 text-[10px] font-mono">
            <pre className="whitespace-pre-wrap">{JSON.stringify(resultC, null, 2)}</pre>
            {(resultC as { conflictReportCsv?: string }).conflictReportCsv ? (
              <button
                type="button"
                className="mt-2 text-xs underline"
                onClick={() =>
                  downloadCsv(
                    (resultC as { conflictReportCsv: string }).conflictReportCsv,
                    `historical-correction-${year}.csv`
                  )
                }
              >
                {t('admin.importCenter.downloadCsv')}
              </button>
            ) : null}
          </div>
        ) : null}
      </OpsCard>
    </div>
  );
}
