'use client';

import { useState, useEffect, useCallback } from 'react';

type Boutique = { id: string; code: string; name: string };

type DailyPreview = { date: string; netSales: number; invoices: number; pieces: number };
type StaffPreview = { date: string; empId: string; name: string; netSales: number; invoices: number; pieces: number; achievementPct: number };

export function HistoricalImportClient() {
  const [boutiques, setBoutiques] = useState<Boutique[]>([]);
  const [boutiqueId, setBoutiqueId] = useState('');
  const [month, setMonth] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [dailyPreview, setDailyPreview] = useState<DailyPreview[] | null>(null);
  const [staffPreview, setStaffPreview] = useState<StaffPreview[] | null>(null);
  const [previewCounts, setPreviewCounts] = useState<{ dailyTotal: number; staffTotal: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    fetch('/api/admin/boutiques')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Forbidden'))))
      .then((list: Boutique[]) => {
        setBoutiques(list);
        if (list.length && !boutiqueId) setBoutiqueId(list[0].id);
      })
      .catch(() => setBoutiques([]));
  }, [boutiqueId]);

  const runPreview = useCallback(async () => {
    if (!file || !boutiqueId || !/^\d{4}-\d{2}$/.test(month)) {
      setMessage({ type: 'err', text: 'Select boutique, month (YYYY-MM), and file.' });
      return;
    }
    setLoading(true);
    setMessage(null);
    setDailyPreview(null);
    setStaffPreview(null);
    setPreviewCounts(null);
    const form = new FormData();
    form.append('file', file);
    form.append('boutiqueId', boutiqueId);
    form.append('month', month);
    form.append('previewOnly', 'true');
    try {
      const res = await fetch('/api/admin/historical-import', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ type: 'err', text: data.error || res.statusText });
        setLoading(false);
        return;
      }
      setDailyPreview(data.daily ?? null);
      setStaffPreview(data.staff ?? null);
      setPreviewCounts(data.dailyTotal != null ? { dailyTotal: data.dailyTotal, staffTotal: data.staffTotal ?? 0 } : null);
      setMessage({ type: 'ok', text: 'Preview loaded.' });
    } catch (e) {
      setMessage({ type: 'err', text: e instanceof Error ? e.message : 'Request failed' });
    }
    setLoading(false);
  }, [file, boutiqueId, month]);

  const save = useCallback(async () => {
    if (!file || !boutiqueId || !/^\d{4}-\d{2}$/.test(month)) {
      setMessage({ type: 'err', text: 'Select boutique, month (YYYY-MM), and file.' });
      return;
    }
    setSaving(true);
    setMessage(null);
    const form = new FormData();
    form.append('file', file);
    form.append('boutiqueId', boutiqueId);
    form.append('month', month);
    try {
      const res = await fetch('/api/admin/historical-import', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ type: 'err', text: data.error || res.statusText });
        setSaving(false);
        return;
      }
      setMessage({ type: 'ok', text: `Saved snapshot: ${data.dailyCount} days, totals ${Number((data.totals?.netSales ?? 0) / 100).toLocaleString()} SAR.` });
      setDailyPreview(null);
      setStaffPreview(null);
      setPreviewCounts(null);
    } catch (e) {
      setMessage({ type: 'err', text: e instanceof Error ? e.message : 'Save failed' });
    }
    setSaving(false);
  }, [file, boutiqueId, month]);

  const halalasToSar = (n: number) => (n / 100).toFixed(2);

  return (
    <div className="min-w-0 space-y-6 p-4 md:p-6">
      <div className="rounded-lg border border-border bg-surface p-6">
        <h1 className="text-lg font-semibold text-foreground">Historical monthly import</h1>
        <p className="mt-1 text-sm text-muted">
          Upload Excel (.xlsx/.xlsm) or CSV for a boutique/month. Data is stored as read-only JSON snapshots (no DB changes).
        </p>

        <div className="mt-6 grid min-w-0 grid-cols-12 gap-4">
          <div className="col-span-12 min-w-0 md:col-span-4">
            <label className="block text-[10px] font-medium uppercase tracking-wider text-muted">Boutique</label>
            <select
              value={boutiqueId}
              onChange={(e) => setBoutiqueId(e.target.value)}
              className="mt-1 w-full min-w-0 rounded border border-border bg-surface px-2 py-1.5 text-sm text-foreground"
              dir="ltr"
            >
              <option value="">Select</option>
              {boutiques.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.code})
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-12 min-w-0 md:col-span-4">
            <label className="block text-[10px] font-medium uppercase tracking-wider text-muted">Month (YYYY-MM)</label>
            <input
              type="text"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              placeholder="2025-01"
              className="mt-1 w-full min-w-0 rounded border border-border px-2 py-1.5 text-sm text-foreground"
              dir="ltr"
            />
          </div>
          <div className="col-span-12 min-w-0 md:col-span-4">
            <label className="block text-[10px] font-medium uppercase tracking-wider text-muted">File (Excel or CSV)</label>
            <input
              type="file"
              accept=".xlsx,.xlsm,.xls,.csv,.txt"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="mt-1 w-full min-w-0 text-sm text-foreground file:me-2 file:rounded file:border-0 file:bg-surface-subtle file:px-2 file:py-1 file:text-sm"
            />
          </div>
        </div>

        <div className="mt-4 flex min-w-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={runPreview}
            disabled={loading || !file || !boutiqueId || !month}
            className="rounded border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground hover:bg-surface-subtle disabled:opacity-50"
          >
            {loading ? 'Loading…' : 'Preview'}
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || !file || !boutiqueId || !month}
            className="rounded border border-emerald-600 bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>

        {message && (
          <p className={`mt-3 text-sm ${message.type === 'ok' ? 'text-emerald-700' : 'text-red-600'}`}>
            {message.text}
          </p>
        )}

        {previewCounts && (
          <p className="mt-2 text-[10px] text-muted">
            Total rows: {previewCounts.dailyTotal} days, {previewCounts.staffTotal} staff rows. Showing first 10 each below.
          </p>
        )}

        {dailyPreview && dailyPreview.length > 0 && (
          <div className="mt-6 min-w-0">
            <h2 className="text-xs font-medium uppercase tracking-wider text-muted">Daily totals (first 10)</h2>
            <div className="mt-2 min-w-0 overflow-x-auto">
              <table className="w-full min-w-0 table-fixed border-collapse text-sm">
                <thead>
                  <tr className="bg-surface-subtle">
                    <th className="max-w-0 py-2 px-2 text-start text-[10px] font-medium uppercase text-muted">Date</th>
                    <th className="max-w-0 py-2 px-2 text-end text-[10px] font-medium uppercase text-muted">Net sales (SAR)</th>
                    <th className="max-w-0 py-2 px-2 text-end text-[10px] font-medium uppercase text-muted">Invoices</th>
                    <th className="max-w-0 py-2 px-2 text-end text-[10px] font-medium uppercase text-muted">Pieces</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyPreview.map((r) => (
                    <tr key={r.date} className="border-b border-border">
                      <td className="max-w-0 truncate py-2 px-2 text-foreground">{r.date}</td>
                      <td className="max-w-0 truncate py-2 px-2 text-end tabular-nums text-foreground">{halalasToSar(r.netSales)}</td>
                      <td className="max-w-0 truncate py-2 px-2 text-end tabular-nums text-foreground">{r.invoices}</td>
                      <td className="max-w-0 truncate py-2 px-2 text-end tabular-nums text-foreground">{r.pieces}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {staffPreview && staffPreview.length > 0 && (
          <div className="mt-6 min-w-0">
            <h2 className="text-xs font-medium uppercase tracking-wider text-muted">Staff (first 10)</h2>
            <div className="mt-2 min-w-0 overflow-x-auto">
              <table className="w-full min-w-0 table-fixed border-collapse text-sm">
                <thead>
                  <tr className="bg-surface-subtle">
                    <th className="max-w-0 py-2 px-2 text-start text-[10px] font-medium uppercase text-muted">Date</th>
                    <th className="max-w-0 py-2 px-2 text-start text-[10px] font-medium uppercase text-muted">Emp / Name</th>
                    <th className="max-w-0 py-2 px-2 text-end text-[10px] font-medium uppercase text-muted">Net sales (SAR)</th>
                    <th className="max-w-0 py-2 px-2 text-end text-[10px] font-medium uppercase text-muted">Invoices</th>
                    <th className="max-w-0 py-2 px-2 text-end text-[10px] font-medium uppercase text-muted">Pieces</th>
                    <th className="max-w-0 py-2 px-2 text-end text-[10px] font-medium uppercase text-muted">Ach%</th>
                  </tr>
                </thead>
                <tbody>
                  {staffPreview.map((r, i) => (
                    <tr key={`${r.date}-${r.empId}-${i}`} className="border-b border-border">
                      <td className="max-w-0 truncate py-2 px-2 text-foreground">{r.date}</td>
                      <td className="max-w-0 truncate py-2 px-2 text-foreground">{r.name || r.empId}</td>
                      <td className="max-w-0 truncate py-2 px-2 text-end tabular-nums text-foreground">{halalasToSar(r.netSales)}</td>
                      <td className="max-w-0 truncate py-2 px-2 text-end tabular-nums text-foreground">{r.invoices}</td>
                      <td className="max-w-0 truncate py-2 px-2 text-end tabular-nums text-foreground">{r.pieces}</td>
                      <td className="max-w-0 truncate py-2 px-2 text-end tabular-nums text-foreground">{r.achievementPct.toFixed(1)}%</td>
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
