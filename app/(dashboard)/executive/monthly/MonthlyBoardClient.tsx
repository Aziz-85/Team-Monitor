'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { addMonths, getCurrentMonthKeyRiyadh, parseMonthKey } from '@/lib/time';
import { ExecutiveLineChart } from '@/components/executive/ExecutiveLineChart';
import { ExecutiveBarChart } from '@/components/executive/ExecutiveBarChart';
import { formatSarInt } from '@/lib/utils/money';

type SnapshotDay = { date: string; netSalesHalalas: number; invoices: number; pieces: number };
type SnapshotStaff = {
  empId?: string;
  name: string;
  netSalesHalalas: number;
  invoices: number;
  pieces: number;
  targetHalalas?: number;
  achievementPct?: number;
};
type Snapshot = {
  month: string;
  branchCode: string;
  boutiqueTargetHalalas?: number;
  daily: SnapshotDay[];
  staff: SnapshotStaff[];
};

const card = 'app-card p-4 md:p-5';

function safeDiv(a: number, b: number): number | null {
  return b > 0 ? a / b : null;
}

function pct(value: number | null): string {
  return value == null ? '—' : `${value.toFixed(1)}%`;
}

function daysForMonth(monthKey: string): string[] {
  const [year, month] = monthKey.split('-').map(Number);
  const count = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Array.from({ length: count }, (_, i) => `${monthKey}-${String(i + 1).padStart(2, '0')}`);
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="app-card relative overflow-hidden p-4">
      <span className="absolute inset-x-0 top-0 h-0.5 bg-border" aria-hidden />
      <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted">{label}</p>
      <p className="mt-2 text-xl font-bold tracking-tight tabular-nums text-foreground">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function MonthlyBoardClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const monthFromUrl = searchParams.get('month') ?? '';
  const monthKey = parseMonthKey(monthFromUrl) ? monthFromUrl : getCurrentMonthKeyRiyadh();
  const [data, setData] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const setMonth = useCallback((month: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('month', month);
    router.push(`${pathname}?${params}`);
  }, [pathname, router, searchParams]);

  useEffect(() => {
    if (!parseMonthKey(monthFromUrl)) setMonth(monthKey);
  }, [monthFromUrl, monthKey, setMonth]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/executive/month-snapshot?month=${encodeURIComponent(monthKey)}`, { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw new Error('Unable to load monthly performance');
        return r.json() as Promise<Snapshot>;
      })
      .then((value) => { if (!cancelled) setData(value); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Unable to load'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [monthKey]);

  const model = useMemo(() => {
    if (!data) return null;
    const dates = daysForMonth(monthKey);
    const byDate = new Map(data.daily.map((d) => [d.date, d]));
    const targetSar = (data.boutiqueTargetHalalas ?? 0) / 100;
    const dailyTarget = dates.length ? targetSar / dates.length : 0;
    let cumulative = 0;
    const daily = dates.map((date, index) => {
      const source = byDate.get(date);
      const sales = (source?.netSalesHalalas ?? 0) / 100;
      cumulative += sales;
      return {
        date,
        day: new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short' }),
        sales,
        invoices: source?.invoices ?? 0,
        pieces: source?.pieces ?? 0,
        dailyTarget,
        cumulative,
        cumulativeTarget: dailyTarget * (index + 1),
      };
    });
    const salesSar = daily.reduce((sum, d) => sum + d.sales, 0);
    const invoices = daily.reduce((sum, d) => sum + d.invoices, 0);
    const pieces = daily.reduce((sum, d) => sum + d.pieces, 0);
    const activeDays = daily.filter((d) => d.sales !== 0 || d.invoices !== 0 || d.pieces !== 0).length;
    const remaining = Math.max(targetSar - salesSar, 0);
    const remainingDays = Math.max(dates.length - activeDays, 0);
    const staff = [...data.staff]
      .map((s) => ({
        ...s,
        sales: s.netSalesHalalas / 100,
        target: (s.targetHalalas ?? 0) / 100,
        achievement: s.achievementPct ?? (s.targetHalalas ? (s.netSalesHalalas / s.targetHalalas) * 100 : null),
        avt: safeDiv(s.netSalesHalalas / 100, s.invoices),
        avp: safeDiv(s.netSalesHalalas / 100, s.pieces),
        upt: safeDiv(s.pieces, s.invoices),
      }))
      .sort((a, b) => b.sales - a.sales);
    return { daily, staff, targetSar, dailyTarget, salesSar, invoices, pieces, activeDays, remaining, remainingDays };
  }, [data, monthKey]);

  if (loading && !model) return <div className="p-8 text-sm text-muted">Loading monthly performance…</div>;
  if (error) return <div className="m-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>;
  if (!model || !data) return null;

  const achievement = safeDiv(model.salesSar * 100, model.targetSar);
  const avt = safeDiv(model.salesSar, model.invoices);
  const avp = safeDiv(model.salesSar, model.pieces);
  const upt = safeDiv(model.pieces, model.invoices);
  const requiredDaily = safeDiv(model.remaining, model.remainingDays);

  return (
    <main className="mx-auto max-w-screen-2xl space-y-5 p-4 md:p-6 print:p-0">
      <header className="relative overflow-hidden rounded-card border border-border/70 bg-surface px-5 py-5 shadow-card md:px-6">
        <span className="absolute inset-y-0 start-0 w-1 bg-accent" aria-hidden />
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-accent">{data.branchCode} · Monthly intelligence</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground">Monthly Performance</h1>
            <p className="mt-1 text-sm text-muted">Boutique results, daily pace and employee contribution in one view.</p>
          </div>
          <div className="flex items-center overflow-hidden rounded-xl border border-border bg-surface shadow-sm print:hidden">
            <button aria-label="Previous month" className="h-10 px-3 text-sm text-muted transition-colors hover:bg-surface-subtle hover:text-accent" onClick={() => setMonth(addMonths(monthKey, -1))}>←</button>
            <input aria-label="Report month" className="h-10 border-x border-border bg-transparent px-3 text-sm font-medium" type="month" value={monthKey} onChange={(e) => parseMonthKey(e.target.value) && setMonth(e.target.value)} />
            <button aria-label="Next month" className="h-10 px-3 text-sm text-muted transition-colors hover:bg-surface-subtle hover:text-accent" onClick={() => setMonth(addMonths(monthKey, 1))}>→</button>
          </div>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        <Kpi label="Net Sales" value={formatSarInt(model.salesSar)} />
        <Kpi label="Monthly Target" value={model.targetSar ? formatSarInt(model.targetSar) : '—'} />
        <Kpi label="Achievement" value={pct(achievement)} hint={model.remaining ? `${formatSarInt(model.remaining)} remaining` : 'Target completed'} />
        <Kpi label="Daily Target" value={model.dailyTarget ? formatSarInt(model.dailyTarget) : '—'} />
        <Kpi label="Invoices" value={model.invoices ? model.invoices.toLocaleString() : '—'} />
        <Kpi label="Pieces" value={model.pieces ? model.pieces.toLocaleString() : '—'} />
        <Kpi label="AVT / AVP" value={`${avt == null ? '—' : formatSarInt(avt)} / ${avp == null ? '—' : formatSarInt(avp)}`} />
        <Kpi label="UPT" value={upt == null ? '—' : upt.toFixed(2)} hint={requiredDaily == null ? undefined : `${formatSarInt(requiredDaily)} required/day`} />
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className={card}>
          <div className="mb-4"><h2 className="text-[15px] font-bold text-foreground">Cumulative Sales vs Target</h2><p className="mt-0.5 text-xs text-muted">Month-to-date performance against planned pace.</p></div>
          <ExecutiveLineChart height={280} data={model.daily.map((d) => ({ label: d.date.slice(8), value: d.cumulative }))} targetLine={model.daily.map((d) => d.cumulativeTarget)} valueFormat={formatSarInt} />
        </div>
        <div className={card}>
          <div className="mb-4"><h2 className="text-[15px] font-bold text-foreground">Employee Achievement</h2><p className="mt-0.5 text-xs text-muted">Top ten employees compared by target achievement.</p></div>
          <ExecutiveBarChart height={280} data={model.staff.slice(0, 10).map((s) => ({ label: s.name.split(' ')[0], value: s.achievement ?? 0 }))} valueFormat={(n) => `${n.toFixed(0)}%`} />
        </div>
      </section>

      <section className={card}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div><h2 className="font-semibold text-foreground">Employee Performance</h2><p className="text-xs text-muted">Ranked by net sales for the selected month.</p></div>
          <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent">{model.staff.length} employees</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-sm">
            <thead className="bg-surface-subtle/70"><tr className="border-b border-border text-left text-[10px] uppercase tracking-[0.08em] text-muted">
              <th className="px-3 py-2">Rank</th><th className="px-3 py-2">Employee</th><th className="px-3 py-2 text-right">Target</th><th className="px-3 py-2 text-right">Sales</th><th className="px-3 py-2 text-right">Achievement</th><th className="px-3 py-2 text-right">Invoices</th><th className="px-3 py-2 text-right">Pieces</th><th className="px-3 py-2 text-right">AVT</th><th className="px-3 py-2 text-right">AVP</th><th className="px-3 py-2 text-right">UPT</th>
            </tr></thead>
            <tbody>{model.staff.map((s, index) => <tr key={`${s.empId ?? s.name}-${index}`} className="border-b border-border/60 last:border-0 hover:bg-surface-subtle/70">
              <td className="px-3 py-3"><span className="inline-grid h-7 w-7 place-items-center rounded-lg bg-surface-subtle text-xs font-bold text-muted">{index + 1}</span></td><td className="px-3 py-3"><p className="font-semibold text-foreground">{s.name}</p><p className="text-xs text-muted">{s.empId ?? '—'}</p></td><td className="px-3 py-3 text-right tabular-nums">{s.target ? formatSarInt(s.target) : '—'}</td><td className="px-3 py-3 text-right font-semibold tabular-nums">{formatSarInt(s.sales)}</td><td className={`px-3 py-3 text-right font-semibold tabular-nums ${s.achievement != null ? (s.achievement >= 100 ? 'text-emerald-700' : s.achievement >= 80 ? 'text-amber-700' : 'text-red-700') : ''}`}>{pct(s.achievement)}</td><td className="px-3 py-3 text-right tabular-nums">{s.invoices || '—'}</td><td className="px-3 py-3 text-right tabular-nums">{s.pieces || '—'}</td><td className="px-3 py-3 text-right tabular-nums">{s.avt == null ? '—' : formatSarInt(s.avt)}</td><td className="px-3 py-3 text-right tabular-nums">{s.avp == null ? '—' : formatSarInt(s.avp)}</td><td className="px-3 py-3 text-right tabular-nums">{s.upt == null ? '—' : s.upt.toFixed(2)}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </section>

      <section className={card}>
        <div className="mb-4"><h2 className="font-semibold text-foreground">Daily Performance</h2><p className="text-xs text-muted">Days without recorded sales remain blank.</p></div>
        <div className="max-h-[620px] overflow-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="sticky top-0 bg-surface"><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted"><th className="px-3 py-2">Date</th><th className="px-3 py-2">Day</th><th className="px-3 py-2 text-right">Sales</th><th className="px-3 py-2 text-right">Daily Target</th><th className="px-3 py-2 text-right">Achievement</th><th className="px-3 py-2 text-right">Invoices</th><th className="px-3 py-2 text-right">Pieces</th><th className="px-3 py-2 text-right">AVT</th><th className="px-3 py-2 text-right">UPT</th></tr></thead>
            <tbody>{model.daily.map((d) => {
              const hasData = d.sales !== 0 || d.invoices !== 0 || d.pieces !== 0;
              return <tr key={d.date} className="border-b border-border/70 last:border-0 hover:bg-surface-subtle"><td className="px-3 py-2 tabular-nums">{d.date}</td><td className="px-3 py-2 text-muted">{d.day}</td><td className="px-3 py-2 text-right font-medium tabular-nums">{hasData ? formatSarInt(d.sales) : ''}</td><td className="px-3 py-2 text-right tabular-nums">{d.dailyTarget ? formatSarInt(d.dailyTarget) : '—'}</td><td className="px-3 py-2 text-right tabular-nums">{hasData ? pct(safeDiv(d.sales * 100, d.dailyTarget)) : ''}</td><td className="px-3 py-2 text-right tabular-nums">{hasData ? d.invoices || '—' : ''}</td><td className="px-3 py-2 text-right tabular-nums">{hasData ? d.pieces || '—' : ''}</td><td className="px-3 py-2 text-right tabular-nums">{hasData && d.invoices ? formatSarInt(d.sales / d.invoices) : ''}</td><td className="px-3 py-2 text-right tabular-nums">{hasData && d.invoices ? (d.pieces / d.invoices).toFixed(2) : ''}</td></tr>;
            })}</tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
