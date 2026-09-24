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
  const monthTarget = (data?.boutiqueTargetHalalas ?? 0) / 100;
  const achievementPct = monthTarget > 0 ? (totalSales / monthTarget) * 100 : 0;
  const avt = totalInvoices > 0 ? totalSales / totalInvoices : 0;

  const kpis = [
    { label: 'Net Sales', value: formatSarInt(totalSales), hint: monthTarget ? `${achievementPct.toFixed(1)}% of target` : 'Recorded net sales', tone: 'accent' },
    { label: 'Monthly Target', value: monthTarget ? formatSarInt(monthTarget) : '—', hint: monthTarget ? `${formatSarInt(Math.max(0, monthTarget - totalSales))} remaining` : 'No target assigned', tone: 'neutral' },
    { label: 'Invoices', value: totalInvoices ? totalInvoices.toLocaleString() : '—', hint: avt ? `${formatSarInt(avt)} average ticket` : 'No invoice data', tone: 'neutral' },
    { label: 'Units per Transaction', value: totalInvoices ? (totalPieces / totalInvoices).toFixed(2) : '—', hint: totalPieces ? `${totalPieces.toLocaleString()} pieces sold` : 'No piece data', tone: 'neutral' },
  ];

  return (
    <main className="mx-auto max-w-screen-2xl space-y-5 p-4 md:p-6">
      <header className="relative overflow-hidden rounded-card border border-border/70 bg-surface px-5 py-5 shadow-card md:px-6">
        <span className="absolute inset-y-0 start-0 w-1 bg-accent" aria-hidden />
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-accent">{data?.branchCode ?? 'Boutique'} · Sales intelligence</p><h1 className="mt-1 text-2xl font-bold tracking-tight">Daily Performance</h1><p className="mt-1 text-sm text-muted">Daily sales, target pace and transaction quality in one view.</p></div>
          <label className="grid gap-1 text-[10px] font-bold uppercase tracking-[0.1em] text-muted">Reporting month<input aria-label="Report month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-10 rounded-xl border border-border bg-surface px-3 text-sm font-medium text-foreground shadow-sm" /></label>
        </div>
      </header>
      {loading ? <div className="app-card p-8 text-center text-sm text-muted">Loading performance data…</div> : !data ? <div className="app-card p-8 text-center text-sm text-muted">No report data is available.</div> : <>
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {kpis.map((kpi) => <article key={kpi.label} className="app-card relative overflow-hidden p-5"><span className={`absolute inset-x-0 top-0 h-0.5 ${kpi.tone === 'accent' ? 'bg-accent' : 'bg-border'}`} /><p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted">{kpi.label}</p><p className="mt-2 text-2xl font-bold tracking-tight tabular-nums">{kpi.value}</p><p className={`mt-1 text-xs ${kpi.tone === 'accent' ? 'text-accent' : 'text-muted'}`}>{kpi.hint}</p></article>)}
        </section>
        <section className="app-card p-4 md:p-5"><div className="mb-4 flex flex-wrap items-end justify-between gap-2"><div><h2 className="text-[15px] font-bold">Cumulative Sales vs Target</h2><p className="mt-0.5 text-xs text-muted">Actual pace compared with the evenly distributed monthly target.</p></div>{monthTarget > 0 && <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-bold text-accent">{achievementPct.toFixed(1)}% achieved</span>}</div><ExecutiveLineChart height={300} data={rows.map((r) => ({ label: r.date.slice(8), value: r.cumulative }))} targetLine={rows.map((r) => r.cumulativeTarget)} valueFormat={formatSarInt} /></section>
        <section className="app-card overflow-hidden"><div className="border-b border-border/70 px-5 py-4"><h2 className="text-[15px] font-bold">Daily Sales Ledger</h2><p className="mt-0.5 text-xs text-muted">Blank days remain visually empty to separate no activity from zero-value transactions.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-sm"><thead className="bg-surface-subtle/75"><tr className="border-b border-border text-left text-[10px] uppercase tracking-[0.08em] text-muted"><th className="px-4 py-3">Date</th><th className="px-3 py-3">Day</th><th className="px-3 py-3 text-right">Sales</th><th className="px-3 py-3 text-right">Daily Target</th><th className="px-3 py-3 text-right">Achievement</th><th className="px-3 py-3 text-right">Invoices</th><th className="px-3 py-3 text-right">Pieces</th><th className="px-3 py-3 text-right">AVT</th><th className="px-4 py-3 text-right">UPT</th></tr></thead><tbody>{rows.map((r) => {
          const hasData = r.sales !== 0 || r.invoices !== 0 || r.pieces !== 0;
          const dayAchievement = r.dailyTarget ? (r.sales / r.dailyTarget) * 100 : 0;
          return <tr key={r.date} className="border-b border-border/60 last:border-0 hover:bg-surface-subtle/70"><td className="px-4 py-2.5 font-medium tabular-nums">{r.date}</td><td className="px-3 py-2.5 text-muted">{new Date(`${r.date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short' })}</td><td className="px-3 py-2.5 text-right font-semibold tabular-nums">{hasData ? formatSarInt(r.sales) : ''}</td><td className="px-3 py-2.5 text-right text-muted tabular-nums">{r.dailyTarget ? formatSarInt(r.dailyTarget) : '—'}</td><td className={`px-3 py-2.5 text-right font-medium tabular-nums ${hasData ? (dayAchievement >= 100 ? 'text-emerald-700' : dayAchievement >= 80 ? 'text-amber-700' : 'text-red-700') : ''}`}>{hasData && r.dailyTarget ? `${dayAchievement.toFixed(1)}%` : ''}</td><td className="px-3 py-2.5 text-right tabular-nums">{hasData ? r.invoices || '—' : ''}</td><td className="px-3 py-2.5 text-right tabular-nums">{hasData ? r.pieces || '—' : ''}</td><td className="px-3 py-2.5 text-right tabular-nums">{hasData && r.invoices ? formatSarInt(r.sales / r.invoices) : ''}</td><td className="px-4 py-2.5 text-right tabular-nums">{hasData && r.invoices ? (r.pieces / r.invoices).toFixed(2) : ''}</td></tr>;
        })}</tbody></table></div></section>
      </>}
    </main>
  );
}
