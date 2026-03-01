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

type MatrixResult = {
  success?: boolean;
  dryRun?: boolean;
  error?: string;
  month?: string;
  sheetName?: string;
  mappedEmployees?: { colIndex: number; headerRaw: string; employeeId: string; employeeName: string }[];
  unmappedEmployees?: { colIndex: number; headerRaw: string; normalized: string }[];
  inserted?: number;
  updated?: number;
  skippedEmpty?: number;
  applyAllowed?: boolean;
  applyBlockReasons?: string[];
  blockingErrorsCount?: number;
  blockingErrors?: { type: string; message: string; row: number; col: number }[];
  sampleNonBlankCells?: { row: number; col: number; headerRaw: string; value: unknown }[];
  diagnostic?: { totalRows?: number; totalCols?: number; recordsParsed?: number };
};

export function MatrixImportClient() {
  const [file, setFile] = useState<File | null>(null);
  const [month, setMonth] = useState(() => getCurrentMonthRiyadh());
  const [includePreviousMonth, setIncludePreviousMonth] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<MatrixResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const runRequest = async (dryRun: boolean) => {
    if (!file || !/^\d{4}-\d{2}$/.test(month.trim())) return;
    setLoading(true);
    setResult(null);
    try {
      const form = new FormData();
      form.set('file', file);
      form.set('month', month.trim());
      form.set('includePreviousMonth', includePreviousMonth ? 'true' : 'false');
      form.set('dryRun', dryRun ? 'true' : 'false');
      const res = await fetch('/api/import/monthly-matrix', { method: 'POST', body: form });
      const j = await res.json();
      if (!res.ok) {
        setResult({ success: false, error: j.error ?? 'Request failed', ...j });
        return;
      }
      setResult(j);
    } catch {
      setResult({ success: false, error: 'Request failed' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl">
      <OpsCard className="mb-6">
        <h3 className="mb-2 border-b border-slate-200 pb-2 text-sm font-medium text-slate-900">
          Monthly Import Template (TeamMonitor_Monthly_Import_Template_Matrix)
        </h3>
        <p className="mb-3 text-xs text-slate-500">
          Upload .xlsx with sheet <strong>DATA_MATRIX</strong>: columns ScopeId (A), Date (B), Day (C), then employee
          columns. Uses operational boutique scope. Preview (dry run) first; Apply writes to DB when there are no
          blocking errors.
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            setFile(f ?? null);
            setResult(null);
            e.target.value = '';
          }}
        />
        <div className="flex flex-wrap items-end gap-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            {file ? file.name : 'Choose .xlsx file'}
          </button>
          <div>
            <label className="me-1 text-xs text-slate-500">Month (YYYY-MM)</label>
            <input
              type="text"
              placeholder="YYYY-MM"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="w-28 rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900"
            />
          </div>
          <label className="flex items-center gap-1.5 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={includePreviousMonth}
              onChange={(e) => setIncludePreviousMonth(e.target.checked)}
            />
            Include previous month
          </label>
          <button
            type="button"
            disabled={!file || !month.trim() || loading}
            onClick={() => runRequest(true)}
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {loading ? '…' : 'Preview'}
          </button>
          <button
            type="button"
            disabled={!file || !month.trim() || loading || (result != null && result.applyAllowed === false)}
            onClick={() => runRequest(false)}
            className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          >
            Apply
          </button>
        </div>

        {result && (
          <div className="mt-4 space-y-2">
            {result.error && <p className="text-sm text-red-600">{result.error}</p>}
            {result.success && (
              <p className="text-sm text-slate-700">
                {result.dryRun ? 'Preview (dry run)' : 'Applied'} — inserted: {result.inserted ?? 0}, updated:{' '}
                {result.updated ?? 0}, skipped empty: {result.skippedEmpty ?? 0}
              </p>
            )}
            {result.applyAllowed === false && result.applyBlockReasons?.length ? (
              <p className="text-sm text-amber-600">Apply blocked: {result.applyBlockReasons.join(', ')}</p>
            ) : null}
            {result.blockingErrorsCount ? (
              <>
                <p className="text-sm text-red-600">Blocking errors: {result.blockingErrorsCount}</p>
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
                      {(result.blockingErrors ?? []).slice(0, 50).map((err, i) => (
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
              <p>Mapped employees: {result.mappedEmployees?.length ?? 0}</p>
              <p>Unmapped employees: {result.unmappedEmployees?.length ?? 0}</p>
              {result.diagnostic && (
                <p>
                  Rows: {result.diagnostic.totalRows} · Cols: {result.diagnostic.totalCols} · Records parsed:{' '}
                  {result.diagnostic.recordsParsed}
                </p>
              )}
            </div>
          </div>
        )}
      </OpsCard>
    </div>
  );
}
