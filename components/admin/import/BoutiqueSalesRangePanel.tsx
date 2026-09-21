'use client';

import { FormEvent, useEffect, useState } from 'react';
import { getCurrentMonthKeyRiyadh, toRiyadhDateString } from '@/lib/time';
import { validateBoutiqueSalesRange } from '@/lib/sales/boutiqueDateRange';

type RangeResult = {
  boutiqueLabel: string;
  from: string;
  to: string;
  totals: { salesSar: number; invoices: number; pieces: number };
  days: Array<{ date: string; salesSar: number; invoices: number; pieces: number }>;
};

const money = (value: number) => `${value.toLocaleString('en-SA')} SAR`;

export function BoutiqueSalesRangePanel() {
  const [from, setFrom] = useState(() => `${getCurrentMonthKeyRiyadh()}-01`);
  const [to, setTo] = useState(() => toRiyadhDateString(new Date()));
  const [result, setResult] = useState<RangeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (start: string, end: string, signal?: AbortSignal) => {
    const invalid = validateBoutiqueSalesRange(start, end);
    if (invalid) {
      setError(invalid);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/sales/boutique-range?from=${start}&to=${end}`, {
        cache: 'no-store',
        signal,
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not load boutique sales.');
      if (!signal?.aborted) setResult(body as RangeResult);
    } catch (cause) {
      if (!signal?.aborted) {
        setResult(null);
        setError(cause instanceof Error ? cause.message : 'Could not load boutique sales.');
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    void load(from, to, controller.signal);
    return () => controller.abort();
    // Initial month-to-date report only; later requests are submitted explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void load(from, to);
  };

  return (
    <section className="rounded-xl border border-border bg-surface p-4 shadow-sm" aria-label="Boutique sales by date range">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Boutique Sales by Date Range</h2>
          <p className="text-sm text-muted">Net sales after discount, from the same sales records as the matrix.</p>
        </div>
        <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
          <label className="text-xs font-medium text-muted">From
            <input aria-label="From date" required type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 block rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground" />
          </label>
          <label className="text-xs font-medium text-muted">To
            <input aria-label="To date" required type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 block rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground" />
          </label>
          <button type="submit" disabled={loading} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{loading ? 'Loading…' : 'Show sales'}</button>
        </form>
      </div>

      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      {result && (
        <div className="mt-4">
          <p className="text-xs text-muted">{result.boutiqueLabel} · {result.from} — {result.to}</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <div className="rounded-lg bg-surface-subtle p-3"><p className="text-xs text-muted">Net sales</p><p className="text-xl font-semibold tabular-nums">{money(result.totals.salesSar)}</p></div>
            <div className="rounded-lg bg-surface-subtle p-3"><p className="text-xs text-muted">Invoices recorded</p><p className="text-xl font-semibold tabular-nums">{result.totals.invoices.toLocaleString('en-SA')}</p></div>
            <div className="rounded-lg bg-surface-subtle p-3"><p className="text-xs text-muted">Pieces recorded</p><p className="text-xl font-semibold tabular-nums">{result.totals.pieces.toLocaleString('en-SA')}</p></div>
          </div>
          <p className="mt-2 text-xs text-muted">Invoice and piece counts include only sales records where those values were entered.</p>
          {result.days.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No sales records in this date range.</p>
          ) : (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-medium text-accent">Daily breakdown ({result.days.length} days with records)</summary>
              <div className="mt-2 max-h-80 overflow-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-surface-subtle"><tr><th className="px-3 py-2 text-start">Date</th><th className="px-3 py-2 text-end">Net sales</th><th className="px-3 py-2 text-end">Invoices</th><th className="px-3 py-2 text-end">Pieces</th></tr></thead>
                  <tbody>{result.days.map((day) => <tr key={day.date} className="border-t border-border"><td className="px-3 py-2 tabular-nums">{day.date}</td><td className="px-3 py-2 text-end tabular-nums">{money(day.salesSar)}</td><td className="px-3 py-2 text-end tabular-nums">{day.invoices || '—'}</td><td className="px-3 py-2 text-end tabular-nums">{day.pieces || '—'}</td></tr>)}</tbody>
                </table>
              </div>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
