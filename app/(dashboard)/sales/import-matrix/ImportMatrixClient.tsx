'use client';

import { useState, useRef } from 'react';
import { OpsCard } from '@/components/ui/OpsCard';

type PreviewResult = {
  ok: boolean;
  mode: 'preview';
  boutiqueId: string;
  scopeId: string;
  monthDetectedRange: { minMonth: string; maxMonth: string };
  rowsRead: number;
  cellsParsed: number;
  toUpsertCount: number;
  totalsByEmp: { empId: string; userId: string; amountSum: number }[];
  sample: { dateKey: string; empId: string; amount: number }[];
  issues: { code: string; message: string; rowIndex?: number; colHeader?: string; dateKey?: string }[];
  error?: string;
};

type ApplyResult = {
  ok: boolean;
  mode: 'apply';
  boutiqueId: string;
  inserted: number;
  updated: number;
  skipped: number;
  issuesCount: number;
  issues: { code: string; message: string; rowIndex?: number; colHeader?: string; dateKey?: string; existingAmount?: number }[];
  error?: string;
};

type ApiResult = PreviewResult | ApplyResult | { ok: false; error: string; issues?: unknown[] };

export function ImportMatrixClient() {
  const [file, setFile] = useState<File | null>(null);
  const [confirmApply, setConfirmApply] = useState(false);
  const [force, setForce] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [applyLoading, setApplyLoading] = useState(false);
  const [result, setResult] = useState<ApiResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const runPreview = async () => {
    if (!file) return;
    setPreviewLoading(true);
    setResult(null);
    try {
      const form = new FormData();
      form.set('file', file);
      form.set('mode', 'preview');
      if (force) form.set('force', 'true');
      const res = await fetch('/api/sales/import/matrix', { method: 'POST', body: form });
      const j: ApiResult = await res.json();
      if (!res.ok) {
        setResult({ ok: false, error: (j as { error?: string }).error ?? 'Preview failed', issues: (j as { issues?: unknown[] }).issues });
        return;
      }
      setResult(j);
    } catch {
      setResult({ ok: false, error: 'Request failed' });
    } finally {
      setPreviewLoading(false);
    }
  };

  const runApply = async () => {
    if (!file || !confirmApply) return;
    setApplyLoading(true);
    try {
      const form = new FormData();
      form.set('file', file);
      form.set('mode', 'apply');
      if (force) form.set('force', 'true');
      const res = await fetch('/api/sales/import/matrix', { method: 'POST', body: form });
      const j: ApiResult = await res.json();
      if (!res.ok) {
        setResult({ ok: false, error: (j as { error?: string; message?: string }).error ?? (j as { message?: string }).message ?? 'Apply failed', issues: (j as { issues?: unknown[] }).issues });
        return;
      }
      setResult(j);
      setConfirmApply(false);
    } catch {
      setResult((prev) => (prev ? { ...prev, ok: false, error: 'Request failed' } : { ok: false, error: 'Request failed' }));
    } finally {
      setApplyLoading(false);
    }
  };

  const isPreview = result?.ok && 'mode' in result && result.mode === 'preview';
  const isApply = result?.ok && 'mode' in result && result.mode === 'apply';
  const previewData = isPreview ? (result as PreviewResult) : null;
  const applyData = isApply ? (result as ApplyResult) : null;
  const issues = previewData?.issues ?? applyData?.issues ?? (result && !result.ok && 'issues' in result ? (result.issues as PreviewResult['issues']) : []);

  return (
    <div className="overflow-x-hidden p-4 md:p-6">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-4 text-xl font-semibold text-slate-900">Monthly Import (Matrix) → SalesEntry</h1>

        <OpsCard className="mb-6">
          <h3 className="mb-2 border-b border-slate-200 pb-2 text-sm font-medium text-slate-900">Upload</h3>
          <p className="mb-3 text-xs text-slate-500">
            Upload an Excel file with DATA_MATRIX sheet (ScopeId, Date, Day, then employee columns like &quot;1205 - Name&quot;). Preview first, then Apply to persist to SalesEntry. ScopeId in file must match your current boutique.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xlsm"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              setFile(f ?? null);
              setResult(null);
              e.target.value = '';
            }}
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              {file ? file.name : 'Choose .xlsx file'}
            </button>
            <label className="flex items-center gap-1.5 text-sm text-slate-700">
              <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
              Force overwrite (including LEDGER)
            </label>
            <button
              type="button"
              disabled={!file || previewLoading}
              onClick={runPreview}
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {previewLoading ? '…' : 'Preview'}
            </button>
            <label className="flex items-center gap-1.5 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={confirmApply}
                onChange={(e) => setConfirmApply(e.target.checked)}
              />
              I confirm applying changes to database
            </label>
            <button
              type="button"
              disabled={!file || !confirmApply || applyLoading}
              onClick={runApply}
              className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            >
              {applyLoading ? '…' : 'Apply'}
            </button>
          </div>
        </OpsCard>

        {result && !result.ok && 'error' in result && (
          <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {result.error}
          </div>
        )}

        {previewData && (
          <>
            <OpsCard className="mb-4">
              <h3 className="mb-2 border-b border-slate-200 pb-2 text-sm font-medium text-slate-900">Preview summary</h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-slate-700 sm:grid-cols-3">
                <span>Boutique:</span><span>{previewData.boutiqueId}</span>
                <span>Scope (code):</span><span>{previewData.scopeId}</span>
                <span>Month range:</span><span>{previewData.monthDetectedRange.minMonth} → {previewData.monthDetectedRange.maxMonth}</span>
                <span>Rows read:</span><span>{previewData.rowsRead}</span>
                <span>Cells parsed:</span><span>{previewData.cellsParsed}</span>
                <span>To upsert:</span><span>{previewData.toUpsertCount}</span>
              </div>
            </OpsCard>

            {previewData.totalsByEmp.length > 0 && (
              <OpsCard className="mb-4">
                <h3 className="mb-2 border-b border-slate-200 pb-2 text-sm font-medium text-slate-900">Totals by employee</h3>
                <div className="max-h-48 overflow-auto">
                  <table className="w-full min-w-0 border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-left">
                        <th className="p-1 font-medium">Emp ID</th>
                        <th className="p-1 font-medium text-right">Sum (SAR)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewData.totalsByEmp.map((r, i) => (
                        <tr key={i} className="border-b border-slate-100">
                          <td className="p-1">{r.empId}</td>
                          <td className="p-1 text-right">{r.amountSum.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </OpsCard>
            )}

            {previewData.sample.length > 0 && (
              <OpsCard className="mb-4">
                <h3 className="mb-2 border-b border-slate-200 pb-2 text-sm font-medium text-slate-900">Sample rows</h3>
                <div className="max-h-40 overflow-auto">
                  <table className="w-full min-w-0 border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-left">
                        <th className="p-1 font-medium">Date</th>
                        <th className="p-1 font-medium">Emp ID</th>
                        <th className="p-1 font-medium text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewData.sample.map((s, i) => (
                        <tr key={i} className="border-b border-slate-100">
                          <td className="p-1">{s.dateKey}</td>
                          <td className="p-1">{s.empId}</td>
                          <td className="p-1 text-right">{s.amount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </OpsCard>
            )}
          </>
        )}

        {applyData && (
          <OpsCard className="mb-4">
            <h3 className="mb-2 border-b border-slate-200 pb-2 text-sm font-medium text-slate-900">Apply result</h3>
            <div className="text-sm text-slate-700">
              Inserted: {applyData.inserted} · Updated: {applyData.updated} · Skipped: {applyData.skipped} · Issues: {applyData.issuesCount}
            </div>
          </OpsCard>
        )}

        {issues.length > 0 && (
          <OpsCard>
            <h3 className="mb-2 border-b border-slate-200 pb-2 text-sm font-medium text-slate-900">Issues</h3>
            <div className="max-h-64 overflow-auto">
              <table className="w-full min-w-0 border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-left">
                    <th className="p-1 font-medium">Code</th>
                    <th className="p-1 font-medium">Message</th>
                    <th className="p-1 font-medium">Row</th>
                    <th className="p-1 font-medium">Col</th>
                    <th className="p-1 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {issues.slice(0, 100).map((iss, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="p-1">{iss.code}</td>
                      <td className="max-w-[12rem] truncate p-1" title={iss.message}>{iss.message}</td>
                      <td className="p-1">{iss.rowIndex ?? '—'}</td>
                      <td className="max-w-[8rem] truncate p-1">{iss.colHeader ?? '—'}</td>
                      <td className="p-1">{iss.dateKey ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {issues.length > 100 && <p className="mt-1 text-xs text-slate-500">Showing first 100 of {issues.length} issues.</p>}
          </OpsCard>
        )}
      </div>
    </div>
  );
}
