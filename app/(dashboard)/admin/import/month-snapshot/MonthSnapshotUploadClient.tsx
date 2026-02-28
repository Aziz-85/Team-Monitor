'use client';

import { useState, useEffect, useCallback } from 'react';

type Boutique = { id: string; code: string; name: string };

type StatusRes = {
  branchCode: string;
  month: string;
  exists: boolean;
  path: string;
  uploadedAtIso?: string;
  lastBackupName?: string;
};

type UploadPreview = {
  mtdSalesSar: number;
  mtdInvoices: number;
  mtdPieces: number;
  staffCount: number;
};

type ValidationErrorItem = {
  code: string;
  message: string;
  sheet?: string;
  row?: number;
  column?: string;
};

export function MonthSnapshotUploadClient({ defaultBranchCode }: { defaultBranchCode: string }) {
  const [boutiques, setBoutiques] = useState<Boutique[]>([]);
  const [branchCode, setBranchCode] = useState(defaultBranchCode);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<StatusRes | null>(null);
  const [preview, setPreview] = useState<UploadPreview | null>(null);
  const [lastUploadResult, setLastUploadResult] = useState<{
    backedUp?: boolean;
    backupName?: string;
    uploadedAtIso?: string;
  } | null>(null);
  const [errors, setErrors] = useState<ValidationErrorItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetch('/api/admin/boutiques')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Forbidden'))))
      .then((list: Boutique[]) => {
        setBoutiques(list);
        if (list.length && !branchCode) setBranchCode(list[0].code);
      })
      .catch(() => setBoutiques([]));
  // eslint-disable-next-line react-hooks/exhaustive-deps -- set default branch only on initial load
  }, []);

  useEffect(() => {
    if (!branchCode || !/^\d{4}-\d{2}$/.test(month)) {
      setStatus(null);
      return;
    }
    setStatus(null);
    fetch(
      `/api/admin/month-snapshot/status?branchCode=${encodeURIComponent(branchCode)}&month=${encodeURIComponent(month)}`
    )
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed'))))
      .then(setStatus)
      .catch(() => setStatus(null));
  }, [branchCode, month]);

  const fetchStatus = useCallback(() => {
    if (!branchCode || !/^\d{4}-\d{2}$/.test(month)) return;
    fetch(
      `/api/admin/month-snapshot/status?branchCode=${encodeURIComponent(branchCode)}&month=${encodeURIComponent(month)}`
    )
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed'))))
      .then(setStatus)
      .catch(() => setStatus(null));
  }, [branchCode, month]);

  const downloadTemplate = useCallback(() => {
    setLoading(true);
    fetch('/api/admin/month-snapshot/template')
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 403 ? 'Forbidden' : 'Failed');
        return r.blob();
      })
      .then((blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'MonthSnapshotTemplate.xlsx';
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const upload = useCallback(async () => {
    if (!file || !branchCode || !/^\d{4}-\d{2}$/.test(month)) return;
    setUploading(true);
    setErrors([]);
    setPreview(null);
    setLastUploadResult(null);
    const form = new FormData();
    form.append('branchCode', branchCode);
    form.append('month', month);
    form.append('file', file);
    try {
      const res = await fetch('/api/admin/month-snapshot/upload', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (res.status === 415 && data.error === 'XLSX_ONLY') {
        setErrors([{ code: 'XLSX_ONLY', message: data.message || 'Only .xlsx is allowed. Macros (.xlsm) are not permitted.' }]);
        setUploading(false);
        return;
      }
      if (res.status === 422 && Array.isArray(data.errors)) {
        setErrors(data.errors);
        setUploading(false);
        return;
      }
      if (!res.ok) {
        setErrors([{ code: 'UPLOAD_FAILED', message: data.error || res.statusText || 'Upload failed' }]);
        setUploading(false);
        return;
      }
      setErrors([]);
      if (data.preview) setPreview(data.preview);
      setLastUploadResult({
        backedUp: data.backedUp,
        backupName: data.backupName,
        uploadedAtIso: data.uploadedAtIso,
      });
      fetchStatus();
    } catch {
      setErrors([{ code: 'UPLOAD_FAILED', message: 'Request failed' }]);
    }
    setUploading(false);
  }, [file, branchCode, month, fetchStatus]);

  return (
    <div className="min-w-0 space-y-6 p-4 md:p-6">
      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <h1 className="text-lg font-semibold text-slate-900">Monthly Snapshot Import</h1>
        <p className="mt-1 text-sm text-slate-600">
          Uploads Excel snapshot to drive Executive analytics (Demand Engine, Drivers, Staff Intelligence).
        </p>

        <div className="mt-6 grid min-w-0 grid-cols-12 gap-4">
          <div className="col-span-12 min-w-0 md:col-span-4">
            <label className="block text-[10px] font-medium uppercase tracking-wider text-slate-500">
              Branch
            </label>
            <select
              value={branchCode}
              onChange={(e) => setBranchCode(e.target.value)}
              className="mt-1 w-full min-w-0 rounded border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900"
              dir="ltr"
            >
              <option value="">Select</option>
              {boutiques.map((b) => (
                <option key={b.id} value={b.code}>
                  {b.name} ({b.code})
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-12 min-w-0 md:col-span-3">
            <label className="block text-[10px] font-medium uppercase tracking-wider text-slate-500">
              Month
            </label>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="mt-1 w-full min-w-0 rounded border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900"
              dir="ltr"
            />
          </div>
        </div>

        <div className="mt-6 flex min-w-0 flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={downloadTemplate}
            disabled={loading}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {loading ? 'Downloading…' : 'Download Template'}
          </button>
          <label className="flex min-w-0 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <input
              type="file"
              accept=".xlsx"
              className="sr-only"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file ? file.name : 'Choose .xlsx'}
          </label>
          <span className="min-w-0 text-[11px] text-slate-500">XLSX only (macros not allowed).</span>
          <button
            type="button"
            onClick={upload}
            disabled={uploading || !file || !branchCode || !/^\d{4}-\d{2}$/.test(month)}
            className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {uploading ? 'Uploading…' : 'Upload & Validate'}
          </button>
        </div>

        <div className="mt-6 min-w-0 space-y-1">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Status</p>
          {status ? (
            <>
              <p className="text-sm text-slate-700">
                <span className="font-medium">{status.exists ? 'Present' : 'Missing'}</span>
                {status.path && (
                  <span className="ml-2 text-slate-500" dir="ltr" title={status.path}>
                    <span className="inline-block max-w-[180px] truncate align-bottom" dir="ltr">
                      ({status.path})
                    </span>
                  </span>
                )}
              </p>
              {status.uploadedAtIso && (
                <p className="text-[11px] text-slate-600">
                  Uploaded at: {new Date(status.uploadedAtIso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
                </p>
              )}
              {status.lastBackupName && (
                <p className="text-[11px] text-slate-600">
                  Last backup: <span className="max-w-[160px] truncate inline-block align-bottom" title={status.lastBackupName}>{status.lastBackupName}</span>
                </p>
              )}
            </>
          ) : (
            <p className="mt-1 text-sm text-slate-500">Select branch and month to check.</p>
          )}
        </div>

        {lastUploadResult && (lastUploadResult.backedUp || lastUploadResult.uploadedAtIso) && (
          <div className="mt-2 min-w-0 rounded border border-slate-100 bg-slate-50/50 p-2 text-[11px] text-slate-600">
            {lastUploadResult.uploadedAtIso && (
              <p>Saved at: {new Date(lastUploadResult.uploadedAtIso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}</p>
            )}
            {lastUploadResult.backedUp && lastUploadResult.backupName && (
              <p className="mt-0.5" title={lastUploadResult.backupName}>
                Backup created: <span className="max-w-[200px] truncate inline-block align-bottom">{lastUploadResult.backupName}</span>
              </p>
            )}
          </div>
        )}

        {preview && (
          <div className="mt-4 min-w-0 rounded border border-slate-100 bg-slate-50/50 p-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
              Last upload preview (SAR whole numbers)
            </p>
            <p className="mt-1 text-sm text-slate-700">
              MTD Sales: {preview.mtdSalesSar.toLocaleString()} SAR · Invoices: {preview.mtdInvoices.toLocaleString()} ·
              Pieces: {preview.mtdPieces.toLocaleString()} · Staff: {preview.staffCount}
            </p>
          </div>
        )}

        {errors.length > 0 && (
          <div className="mt-4 min-w-0 overflow-hidden">
            <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
              Validation errors
            </p>
            <div className="mt-1 overflow-x-auto">
              <table className="w-full min-w-0 border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="py-2 px-2 text-left font-medium text-slate-600">Code</th>
                    <th className="py-2 px-2 text-left font-medium text-slate-600">Message</th>
                    <th className="py-2 px-2 text-left font-medium text-slate-600">Location</th>
                  </tr>
                </thead>
                <tbody>
                  {errors.map((e, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="py-2 px-2 text-slate-700">{e.code}</td>
                      <td className="py-2 px-2 text-slate-700">{e.message}</td>
                      <td className="py-2 px-2 text-slate-500">
                        {[e.sheet, e.row != null ? `Row ${e.row}` : null, e.column]
                          .filter(Boolean)
                          .join(' · ') || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
