'use client';

import { useEffect, useState, useRef } from 'react';
import { OpsCard } from '@/components/ui/OpsCard';
import { useI18n } from '@/app/providers';

function getNested(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((o: unknown, k) => (o as Record<string, unknown>)?.[k], obj);
}

function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(dateStr: string, delta: number): string {
  const d = new Date(dateStr + 'T12:00:00.000Z');
  d.setUTCDate(d.getUTCDate() + delta);
  return toLocalDateString(d);
}

type Line = { id: string; employeeId: string; amountSar: number; source: string };
type Summary = {
  id: string | null;
  boutiqueId: string;
  boutique: { id: string; code: string; name: string };
  date: string;
  totalSar: number;
  status: string;
  linesTotal: number;
  diff: number;
  canLock: boolean;
  lines: Line[];
};

type DailyData = {
  date: string;
  scope: { boutiqueIds: string[]; label: string };
  summaries: Summary[];
};

export function SalesDailyClient() {
  const { messages } = useI18n();
  const t = (key: string) => (getNested(messages, key) as string) || key;
  const [date, setDate] = useState(() => toLocalDateString(new Date()));
  const [data, setData] = useState<DailyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingSummary, setSavingSummary] = useState<string | null>(null);
  const [savingLine, setSavingLine] = useState<string | null>(null);
  const [locking, setLocking] = useState<string | null>(null);
  const [yearlyFile, setYearlyFile] = useState<File | null>(null);
  const [yearlyMonth, setYearlyMonth] = useState('');
  const [yearlyDryRun, setYearlyDryRun] = useState(true);
  const [yearlyLoading, setYearlyLoading] = useState(false);
  const [yearlyResult, setYearlyResult] = useState<{
    dryRun: boolean;
    daysAffected?: string[];
    unmappedEmpIds?: string[];
    skippedEmpty?: number;
    skippedDash?: number;
    inserted?: number;
    updated?: number;
    rowsQueued?: number;
    perDateSummary?: {
      date: string;
      linesTotalBefore?: number;
      linesTotalAfter?: number;
      insertedLinesCount: number;
      updatedLinesCount: number;
      skippedEmptyCount: number;
      linesTotalSar: number;
      managerTotalSar: number;
      diffSar: number;
    }[];
    errors?: { row: number; col: number; header: string; rawValue: unknown; reason: string }[];
    error?: string;
  } | null>(null);
  const yearlyFileInputRef = useRef<HTMLInputElement>(null);

  function getCurrentMonthRiyadh(): string {
    const d = new Date();
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit' });
    const parts = fmt.formatToParts(d);
    const year = parts.find((p) => p.type === 'year')?.value ?? '';
    const month = parts.find((p) => p.type === 'month')?.value ?? '';
    return `${year}-${month}`;
  }

  const [coverageMonth, setCoverageMonth] = useState('');
  const [coverageLoading, setCoverageLoading] = useState(false);
  const [coverageResult, setCoverageResult] = useState<{
    scopeId?: string;
    month?: string;
    maxSalesGapDays?: number;
    expectedDaysCountTotal?: number;
    recordedCountTotal?: number;
    completenessPct?: number;
    byEmployee?: Array<{
      employeeId: string;
      name: string;
      expectedDaysCount?: number;
      recordedDaysCount?: number;
      missingDaysCount?: number;
      flaggedGapsCount?: number;
      expectedDays?: string[];
      missingDays?: string[];
      flaggedGaps?: Array<{ from: string; to: string; expectedMissingCount: number }>;
    }>;
    byDate?: Array<{
      date: string;
      expectedEmployees: string[];
      recordedEmployees: string[];
      missingEmployees: string[];
      isFlaggedDate: boolean;
    }>;
    error?: string;
  } | null>(null);

  useEffect(() => {
    if (coverageMonth === '') setCoverageMonth(getCurrentMonthRiyadh());
  }, [coverageMonth]);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/sales/daily?date=${date}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setData(null);
        else setData(d);
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [date]);

  const refetch = () => {
    setLoading(true);
    fetch(`/api/sales/daily?date=${date}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => (d.error ? null : setData(d)))
      .finally(() => setLoading(false));
  };

  const setManagerTotal = async (boutiqueId: string, totalSar: number) => {
    setSavingSummary(boutiqueId);
    try {
      const res = await fetch('/api/sales/daily/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boutiqueId, date, totalSar }),
      });
      if (res.ok) refetch();
    } finally {
      setSavingSummary(null);
    }
  };

  const upsertLine = async (boutiqueId: string, employeeId: string, amountSar: number) => {
    setSavingLine(`${boutiqueId}-${employeeId}`);
    try {
      const res = await fetch('/api/sales/daily/lines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boutiqueId, date, employeeId, amountSar }),
      });
      if (res.ok) refetch();
    } finally {
      setSavingLine(null);
    }
  };

  const lock = async (boutiqueId: string) => {
    setLocking(boutiqueId);
    try {
      const res = await fetch('/api/sales/daily/lock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boutiqueId, date }),
      });
      if (res.ok) refetch();
    } finally {
      setLocking(null);
    }
  };

  const runYearlyImport = async () => {
    if (!yearlyFile) return;
    setYearlyLoading(true);
    setYearlyResult(null);
    try {
      const form = new FormData();
      form.set('file', yearlyFile);
      form.set('dryRun', yearlyDryRun ? '1' : '0');
      if (yearlyMonth.trim()) form.set('month', yearlyMonth.trim());
      const res = await fetch('/api/sales/import/yearly', { method: 'POST', body: form });
      const j = await res.json();
      if (!res.ok) {
        setYearlyResult({
          dryRun: yearlyDryRun,
          error: j.error ?? 'Import failed',
          errors: j.errors,
        });
        return;
      }
      setYearlyResult({
        dryRun: j.dryRun ?? yearlyDryRun,
        daysAffected: j.daysAffected,
        unmappedEmpIds: j.unmappedEmpIds,
        skippedEmpty: j.skippedEmpty,
        skippedDash: j.skippedDash,
        inserted: j.inserted,
        updated: j.updated,
        rowsQueued: j.rowsQueued,
        perDateSummary: j.perDateSummary,
        errors: j.errors,
      });
      if (!yearlyDryRun) refetch();
    } catch {
      setYearlyResult({ dryRun: yearlyDryRun, error: 'Request failed' });
    } finally {
      setYearlyLoading(false);
      setYearlyDryRun(true);
    }
  };

  const loadCoverage = async () => {
    if (!coverageMonth.trim()) return;
    setCoverageLoading(true);
    setCoverageResult(null);
    try {
      const res = await fetch(`/api/sales/coverage?month=${encodeURIComponent(coverageMonth.trim())}`, { cache: 'no-store' });
      const j = await res.json();
      if (!res.ok) {
        setCoverageResult({ error: j.error ?? 'Failed to load coverage' });
        return;
      }
      setCoverageResult({
        scopeId: j.scopeId,
        month: j.month,
        maxSalesGapDays: j.maxSalesGapDays,
        expectedDaysCountTotal: j.expectedDaysCountTotal,
        recordedCountTotal: j.recordedCountTotal,
        completenessPct: j.completenessPct,
        byEmployee: (j.byEmployee ?? []).map((e: { employeeId: string; name: string; expectedDays: string[]; recordedDays: string[]; missingDays: string[]; flaggedGaps: Array<{ from: string; to: string; expectedMissingCount: number }> }) => ({
          employeeId: e.employeeId,
          name: e.name,
          expectedDaysCount: e.expectedDays?.length ?? 0,
          recordedDaysCount: e.recordedDays?.length ?? 0,
          missingDaysCount: e.missingDays?.length ?? 0,
          flaggedGapsCount: e.flaggedGaps?.length ?? 0,
          expectedDays: e.expectedDays,
          missingDays: e.missingDays,
          flaggedGaps: e.flaggedGaps,
        })),
        byDate: j.byDate,
      });
    } catch {
      setCoverageResult({ error: 'Request failed' });
    } finally {
      setCoverageLoading(false);
    }
  };

  const diffClass = (d: number) =>
    d === 0 ? 'text-green-700' : d >= 1 ? 'text-amber-700' : 'text-red-700';
  const diffText = (d: number) => (d === 0 ? '0' : d >= 1 ? `+${d}` : d);

  return (
    <div className="overflow-x-hidden p-4 md:p-6">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-4 text-xl font-semibold text-slate-900">Daily Sales Ledger</h1>
        <div className="mb-4 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDate(addDays(date, -1))}
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              ← Prev
            </button>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900"
            />
            <button
              type="button"
              onClick={() => setDate(addDays(date, 1))}
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              Next →
            </button>
          </div>
          {data?.scope?.label && (
            <span className="rounded bg-slate-200 px-2 py-1 text-sm text-slate-700">
              Scope: {data.scope.label}
            </span>
          )}
        </div>
        <OpsCard className="mb-6">
          <h3 className="mb-2 border-b border-slate-200 pb-2 text-sm font-medium text-slate-900">
            Yearly Excel Import (Import_2026)
          </h3>
          <div className="flex flex-wrap items-end gap-3">
            <input
              ref={yearlyFileInputRef}
              type="file"
              accept=".xlsx,.xlsm"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                setYearlyFile(f ?? null);
                setYearlyResult(null);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => yearlyFileInputRef.current?.click()}
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              {yearlyFile ? yearlyFile.name : 'Choose file'}
            </button>
            <div>
              <label className="mr-1 text-xs text-slate-500">Month (optional)</label>
              <input
                type="text"
                placeholder="YYYY-MM"
                value={yearlyMonth}
                onChange={(e) => setYearlyMonth(e.target.value)}
                className="w-28 rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900"
              />
            </div>
            <label className="flex items-center gap-1.5 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={yearlyDryRun}
                onChange={(e) => setYearlyDryRun(e.target.checked)}
              />
              Dry run
            </label>
            <button
              type="button"
              disabled={!yearlyFile || yearlyLoading}
              onClick={runYearlyImport}
              className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            >
              {yearlyLoading ? '…' : yearlyDryRun ? 'Preview (Dry Run)' : 'Import Now'}
            </button>
          </div>
          {!yearlyDryRun && (
            <p className="mt-2 text-xs text-amber-700">
              Import will write to database. Keep Dry Run ON to preview.
            </p>
          )}
          <p className="mt-1 text-xs text-slate-500">
            If manager total is 0, import will auto-set it to lines total.
          </p>
          {yearlyResult && (
            <>
              <pre className="mt-3 max-h-48 overflow-auto rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-800">
                {yearlyResult.error
                  ? (yearlyResult.errors?.length
                      ? `${yearlyResult.error}\n\n${JSON.stringify(yearlyResult.errors, null, 2)}`
                      : yearlyResult.error)
                  : JSON.stringify(
                      {
                        daysAffected: yearlyResult.daysAffected,
                        unmappedEmpIds: yearlyResult.unmappedEmpIds,
                        skippedEmpty: yearlyResult.skippedEmpty,
                        skippedDash: yearlyResult.skippedDash,
                        inserted: yearlyResult.inserted,
                        updated: yearlyResult.updated,
                        rowsQueued: yearlyResult.rowsQueued,
                        perDateSummary: yearlyResult.perDateSummary,
                      },
                      null,
                      2
                    )}
              </pre>
              {!yearlyResult.error && yearlyResult.perDateSummary && yearlyResult.perDateSummary.length > 0 && (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-0 border-collapse text-xs text-slate-800">
                    <thead>
                      <tr className="border-b border-slate-200 text-left font-medium text-slate-600">
                        <th className="py-1.5 pr-2">Date</th>
                        <th className="py-1.5 pr-2 text-right">Inserted</th>
                        <th className="py-1.5 pr-2 text-right">Updated</th>
                        <th className="py-1.5 pr-2 text-right">Skipped</th>
                        <th className="py-1.5 pr-2 text-right">Lines total</th>
                        <th className="py-1.5 pr-2 text-right">Manager total</th>
                        <th className="py-1.5 pr-2 text-right">Diff</th>
                        <th className="py-1.5 w-0" />
                      </tr>
                    </thead>
                    <tbody>
                      {yearlyResult.perDateSummary.map((row) => (
                        <tr key={row.date} className="border-b border-slate-100">
                          <td className="py-1.5 pr-2 font-mono">{row.date}</td>
                          <td className="py-1.5 pr-2 text-right font-mono">{row.insertedLinesCount}</td>
                          <td className="py-1.5 pr-2 text-right font-mono">{row.updatedLinesCount}</td>
                          <td className="py-1.5 pr-2 text-right font-mono">{row.skippedEmptyCount}</td>
                          <td className="py-1.5 pr-2 text-right font-mono">{row.linesTotalSar.toLocaleString('en-SA')}</td>
                          <td className="py-1.5 pr-2 text-right font-mono">{row.managerTotalSar.toLocaleString('en-SA')}</td>
                          <td className="py-1.5 pr-2 text-right font-mono">{row.diffSar.toLocaleString('en-SA')}</td>
                          <td className="py-1.5">
                            <button
                              type="button"
                              onClick={() => setDate(row.date)}
                              className="rounded border border-slate-300 bg-white px-2 py-0.5 text-slate-700 hover:bg-slate-50"
                            >
                              Jump to date
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </OpsCard>
        <OpsCard className="mb-6">
          <h3 className="mb-2 border-b border-slate-200 pb-2 text-sm font-medium text-slate-900">
            Coverage (Smart Missing)
          </h3>
          <p className="mb-2 text-xs text-slate-500">
            Expected days = scheduled (not off, not leave). Missing only flagged when consecutive missing &gt; maxSalesGapDays.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mr-1 text-xs text-slate-500">Month (YYYY-MM)</label>
              <input
                type="text"
                placeholder="YYYY-MM"
                value={coverageMonth}
                onChange={(e) => setCoverageMonth(e.target.value)}
                className="w-28 rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900"
              />
            </div>
            <button
              type="button"
              disabled={!coverageMonth.trim() || coverageLoading}
              onClick={loadCoverage}
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {coverageLoading ? '…' : 'Load Coverage'}
            </button>
          </div>
          {coverageResult && (
            <div className="mt-3 space-y-2">
              {coverageResult.error ? (
                <p className="text-sm text-red-600">{coverageResult.error}</p>
              ) : (
                <>
                  <p className="text-sm font-medium text-slate-700">
                    Completeness: {coverageResult.completenessPct ?? 0}% ({coverageResult.recordedCountTotal ?? 0} / {coverageResult.expectedDaysCountTotal ?? 0} expected days)
                  </p>
                  <p className="text-xs text-slate-500">Max gap days (grace): {coverageResult.maxSalesGapDays ?? 7}</p>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-0 table-auto border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-left text-slate-600">
                          <th className="py-1.5 pr-2">Employee</th>
                          <th className="py-1.5 pr-2 text-right">Expected</th>
                          <th className="py-1.5 pr-2 text-right">Recorded</th>
                          <th className="py-1.5 pr-2 text-right">Missing</th>
                          <th className="py-1.5 pr-2 text-right">Flagged gaps</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(coverageResult.byEmployee ?? []).map((e) => (
                          <tr key={e.employeeId} className="border-b border-slate-100">
                            <td className="py-1.5 pr-2 font-medium">{e.name}</td>
                            <td className="py-1.5 pr-2 text-right">{e.expectedDaysCount ?? 0}</td>
                            <td className="py-1.5 pr-2 text-right">{e.recordedDaysCount ?? 0}</td>
                            <td className="py-1.5 pr-2 text-right">{e.missingDaysCount ?? 0}</td>
                            <td className="py-1.5 pr-2 text-right">{e.flaggedGapsCount ?? 0}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <details className="text-xs text-slate-600">
                    <summary>Gap ranges and missing days (per employee)</summary>
                    <pre className="mt-1 max-h-48 overflow-auto rounded border border-slate-200 bg-slate-50 p-2">
                      {JSON.stringify(
                        coverageResult.byEmployee?.map((e) => ({
                          name: e.name,
                          missingDays: e.missingDays,
                          flaggedGaps: e.flaggedGaps,
                        })),
                        null,
                        2
                      )}
                    </pre>
                  </details>
                </>
              )}
            </div>
          )}
        </OpsCard>
        {loading && <p className="text-slate-500">Loading…</p>}
        {!loading && data?.summaries?.length === 0 && (
          <p className="text-slate-500">No summaries for this date. Set manager total per boutique below.</p>
        )}
        {!loading &&
          data?.summaries?.map((s) => (
            <OpsCard key={s.id ?? s.boutiqueId} className="mb-6">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
                  <h2 className="font-medium text-slate-900">
                    {s.boutique.name} ({s.boutique.code})
                  </h2>
                  <span
                    className={
                      s.status === 'LOCKED' ? 'rounded bg-amber-100 px-2 py-0.5 text-sm text-amber-800' : 'rounded bg-slate-100 px-2 py-0.5 text-sm text-slate-700'
                    }
                  >
                    {s.status}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div>
                    <label className="text-xs text-slate-500">Manager total (SAR)</label>
                    <ManagerTotalInput
                      summary={s}
                      saving={savingSummary === s.boutiqueId}
                      onSave={(v) => setManagerTotal(s.boutiqueId, v)}
                    />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Lines total (SAR)</p>
                    <p className="font-mono text-slate-900">{s.linesTotal.toLocaleString('en-SA')}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Diff</p>
                    <p className={`font-mono ${diffClass(s.diff)}`}>{diffText(s.diff)}</p>
                  </div>
                  <div className="flex items-end">
                    <button
                      type="button"
                      disabled={!s.canLock || locking === s.boutiqueId}
                      onClick={() => lock(s.boutiqueId)}
                      className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                    >
                      {locking === s.boutiqueId ? 'Locking…' : 'Lock'}
                    </button>
                  </div>
                </div>
                {s.diff !== 0 && (
                  <p className="text-sm text-amber-700">{t('targets.cannotLockUntilDiffZero') ?? 'Cannot lock until lines total equals manager total (diff = 0).'}</p>
                )}
                <div className="overflow-x-auto overflow-y-visible" style={{ maxWidth: '100%' }}>
                  <table className="w-full min-w-0 table-auto border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-slate-600">
                        <th className="py-2 pr-2">Employee ID</th>
                        <th className="py-2 pr-2">Amount (SAR)</th>
                        <th className="w-0" />
                      </tr>
                    </thead>
                    <tbody>
                      {s.lines.map((line) => (
                        <LineRow
                          key={line.id}
                          boutiqueId={s.boutiqueId}
                          line={line}
                          saving={savingLine === `${s.boutiqueId}-${line.employeeId}`}
                          onSave={upsertLine}
                          disabled={s.status === 'LOCKED'}
                        />
                      ))}
                      <NewLineRow boutiqueId={s.boutiqueId} date={date} onSave={upsertLine} saving={!!savingLine} />
                    </tbody>
                  </table>
                </div>
              </div>
            </OpsCard>
          ))}
      </div>
    </div>
  );
}

function ManagerTotalInput({
  summary,
  saving,
  onSave,
}: {
  summary: Summary;
  saving: boolean;
  onSave: (v: number) => void;
}) {
  const [val, setVal] = useState(String(summary.totalSar));
  useEffect(() => setVal(String(summary.totalSar)), [summary.totalSar]);
  const num = parseInt(val, 10);
  const valid = Number.isInteger(num) && num >= 0;
  return (
    <div className="flex gap-1">
      <input
        type="number"
        min={0}
        step={1}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        disabled={summary.status === 'LOCKED'}
        className="w-28 rounded border border-slate-300 bg-white px-2 py-1 font-mono text-slate-900"
      />
      {summary.status === 'DRAFT' && (
        <button
          type="button"
          disabled={saving || !valid}
          onClick={() => valid && onSave(num)}
          className="rounded bg-slate-200 px-2 py-1 text-sm text-slate-700 disabled:opacity-50"
        >
          {saving ? '…' : 'Save'}
        </button>
      )}
    </div>
  );
}

function LineRow({
  boutiqueId,
  line,
  saving,
  onSave,
  disabled,
}: {
  boutiqueId: string;
  line: Line;
  saving: boolean;
  onSave: (b: string, e: string, a: number) => void;
  disabled: boolean;
}) {
  const [amount, setAmount] = useState(String(line.amountSar));
  useEffect(() => setAmount(String(line.amountSar)), [line.amountSar]);
  const num = parseInt(amount, 10);
  const valid = Number.isInteger(num) && num >= 0;
  return (
    <tr className="border-b border-slate-100">
      <td className="py-1 pr-2 font-mono text-slate-900">{line.employeeId}</td>
      <td className="py-1 pr-2">
        <input
          type="number"
          min={0}
          step={1}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={disabled}
          className="w-24 rounded border border-slate-300 bg-white px-2 py-1 font-mono text-slate-900"
        />
      </td>
      <td className="py-1">
        {!disabled && (
          <button
            type="button"
            disabled={saving || !valid}
            onClick={() => valid && onSave(boutiqueId, line.employeeId, num)}
            className="text-sm text-sky-600 hover:underline"
          >
            {saving ? '…' : 'Save'}
          </button>
        )}
      </td>
    </tr>
  );
}

function NewLineRow({
  boutiqueId,
  onSave,
  saving,
}: {
  boutiqueId: string;
  date?: string;
  onSave: (b: string, e: string, a: number) => void;
  saving: boolean;
}) {
  const [empId, setEmpId] = useState('');
  const [amount, setAmount] = useState('');
  const num = parseInt(amount, 10);
  const valid = empId.trim() && Number.isInteger(num) && num >= 0;
  return (
    <tr className="border-b border-slate-100 bg-slate-50/50">
      <td className="py-1 pr-2">
        <input
          type="text"
          placeholder="Emp ID"
          value={empId}
          onChange={(e) => setEmpId(e.target.value)}
          className="w-28 rounded border border-slate-300 bg-white px-2 py-1 font-mono text-slate-900"
        />
      </td>
      <td className="py-1 pr-2">
        <input
          type="number"
          min={0}
          step={1}
          placeholder="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-24 rounded border border-slate-300 bg-white px-2 py-1 font-mono text-slate-900"
        />
      </td>
      <td className="py-1">
        <button
          type="button"
          disabled={saving || !valid}
          onClick={() => {
            if (valid) {
              onSave(boutiqueId, empId.trim(), num);
              setEmpId('');
              setAmount('');
            }
          }}
          className="text-sm text-sky-600 hover:underline"
        >
          Add
        </button>
      </td>
    </tr>
  );
}
