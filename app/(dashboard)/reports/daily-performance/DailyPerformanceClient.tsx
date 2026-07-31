'use client';

import { useEffect, useMemo, useState } from 'react';
import { ExecutiveLineChart } from '@/components/executive/ExecutiveLineChart';
import { formatSarInt } from '@/lib/utils/money';
import { getCurrentMonthKeyRiyadh } from '@/lib/time';

type Day = { date: string; netSalesHalalas: number; invoices: number; pieces: number };
type Snapshot = { month: string; branchCode: string; boutiqueTargetHalalas?: number; daily: Day[] };

function monthDates(month: string): string[] {
  const [y, m] = month.split('-').map(Number);
  return Array.from({ length: new Date(Date.UTC(y, m, 0)).getUTCDate() }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
}

export function DailyPerformanceClient() {
  const [month, setMonth] = useState(getCurrentMonthKeyRiyadh());
  const [data, setData] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/executive/month-snapshot?month=${encodeURIComponent(month)}`, { cache: 'no-store' })
      .then((r) => r.ok ? r.json() : Promise.reject(new Error('Failed')))
      .then((v) => { if (!cancelled) setData(v); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [month]);

  const rows = useMemo(() => {
    if (!data) return [];
    const dates = monthDates(month);
    const map = new Map(data.daily.map((d) => [d.date, d]));
    const target = (data.boutiqueTargetHalalas ?? 0) / 100;
    const dailyTarget = dates.length ? target / dates.length : 0;
    let cumulative = 0;
    return dates.map((date, index) => {
      const source = map.get(date);
      const sales = (source?.netSalesHalalas ?? 0) / 100;
      cumulative += sales;
      return { date, sales, invoices: source?.invoices ?? 0, pieces: source?.pieces ?? 0, dailyTarget, cumulative, cumulativeTarget: dailyTarget * (index + 1) };
    });
  }, [data, month]);

  const totalSales = rows.reduce((s, r) => s + r.sales, 0);
  const totalInvoices = rows.reduce((s, r) => s + r.invoices, 0);
  const totalPieces = rows.reduce((s, r) => s + r.pieces, 0);

  return (
    <main className="mx-auto max-w-screen-xl space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#9A7B28]">{data?.branchCode ?? 'Boutique'}</p><h1 className="mt-1 text-2xl font-semibold">Daily Performance</h1><p className="text-sm text-muted">A read-only daily sales report. Sales entry remains separate.</p></div>
        <input aria-label="Report month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-xl border border-border bg-surface px-3 py-2 text-sm" />
      </header>
      {loading ? <p className="text-sm text-muted">Loading…</p> : !data ? <div className="rounded-xl border border-border bg-surface p-6 text-sm text-muted">No report data is available.</div> : <>
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Net Sales', formatSarInt(totalSales)],
            ['Invoices', totalInvoices ? totalInvoices.toLocaleString() : '—'],
            ['Pieces', totalPieces ? totalPieces.toLocaleString() : '—'],
            ['UPT', totalInvoices ? (totalPieces / totalInvoices).toFixed(2) : '—'],
          ].map(([label, value]) => <div key={label} className="rounded-2xl border border-[#E8DFC8] bg-surface p-4 shadow-sm"><p className="text-xs uppercase tracking-wide text-muted">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p></div>)}
        </section>
        <section className="rounded-2xl border border-[#E8DFC8] bg-surface p-4 shadow-sm"><h2 className="mb-4 font-semibold">Cumulative Sales vs Target</h2><ExecutiveLineChart height={300} data={rows.map((r) => ({ label: r.date.slice(8), value: r.cumulative }))} targetLine={rows.map((r) => r.cumulativeTarget)} valueFormat={formatSarInt} /></section>
        <section className="rounded-2xl border border-[#E8DFC8] bg-surface p-4 shadow-sm"><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-sm"><thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted"><th className="px-3 py-2">Date</th><th className="px-3 py-2">Day</th><th className="px-3 py-2 text-right">Sales</th><th className="px-3 py-2 text-right">Daily Target</th><th className="px-3 py-2 text-right">Achievement</th><th className="px-3 py-2 text-right">Invoices</th><th className="px-3 py-2 text-right">Pieces</th><th className="px-3 py-2 text-right">AVT</th><th className="px-3 py-2 text-right">UPT</th></tr></thead><tbody>{rows.map((r) => {
          const hasData = r.sales !== 0 || r.invoices !== 0 || r.pieces !== 0;
          return <tr key={r.date} className="border-b border-border/70 last:border-0 hover:bg-surface-subtle"><td className="px-3 py-2 tabular-nums">{r.date}</td><td className="px-3 py-2 text-muted">{new Date(`${r.date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short' })}</td><td className="px-3 py-2 text-right font-medium tabular-nums">{hasData ? formatSarInt(r.sales) : ''}</td><td className="px-3 py-2 text-right tabular-nums">{r.dailyTarget ? formatSarInt(r.dailyTarget) : '—'}</td><td className="px-3 py-2 text-right tabular-nums">{hasData && r.dailyTarget ? `${((r.sales / r.dailyTarget) * 100).toFixed(1)}%` : ''}</td><td className="px-3 py-2 text-right tabular-nums">{hasData ? r.invoices || '—' : ''}</td><td className="px-3 py-2 text-right tabular-nums">{hasData ? r.pieces || '—' : ''}</td><td className="px-3 py-2 text-right tabular-nums">{hasData && r.invoices ? formatSarInt(r.sales / r.invoices) : ''}</td><td className="px-3 py-2 text-right tabular-nums">{hasData && r.invoices ? (r.pieces / r.invoices).toFixed(2) : ''}</td></tr>;
        })}</tbody></table></div></section>
      </>}
    </main>
  );
}
