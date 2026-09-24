'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { addMonths, getCurrentMonthKeyRiyadh, parseMonthKey } from '@/lib/time';
import { formatSarInt } from '@/lib/utils/money';

type Day = { date: string; netSalesHalalas: number; invoices: number; pieces: number };
type Staff = { empId?: string; name: string; netSalesHalalas: number; invoices: number; pieces: number; targetHalalas?: number; achievementPct?: number };
type Snapshot = { month: string; branchCode: string; boutiqueTargetHalalas?: number; daily: Day[]; staff: Staff[] };
type Tab = 'overview' | 'trends' | 'team' | 'detail';

const tabs: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'trends', label: 'Sales Trends' },
  { id: 'team', label: 'Team Performance' },
  { id: 'detail', label: 'Detailed Report' },
];

const sar = (halalas: number) => halalas / 100;
const ratio = (a: number, b: number) => b > 0 ? a / b : null;
const percent = (n: number | null, digits = 1) => n == null ? '—' : `${n.toFixed(digits)}%`;
const previousYear = (month: string) => `${Number(month.slice(0, 4)) - 1}${month.slice(4)}`;

function csvCell(value: string | number) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function Delta({ value, suffix = '%' }: { value: number | null; suffix?: string }) {
  if (value == null) return <span className="text-muted">No comparison</span>;
  const positive = value >= 0;
  return <span className={positive ? 'text-emerald-700' : 'text-rose-700'}>{positive ? '↗' : '↘'} {Math.abs(value).toFixed(1)}{suffix}</span>;
}

function Metric({ label, value, delta, accent = false }: { label: string; value: string; delta?: number | null; accent?: boolean }) {
  return (
    <article className={`relative overflow-hidden rounded-2xl border p-4 shadow-sm ${accent ? 'border-accent/25 bg-accent text-white' : 'border-border bg-surface'}`}>
      <p className={`text-[10px] font-bold uppercase tracking-[0.14em] ${accent ? 'text-white/70' : 'text-muted'}`}>{label}</p>
      <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums">{value}</p>
      {delta !== undefined && <p className={`mt-1 text-xs font-semibold ${accent ? 'text-white/80' : ''}`}><Delta value={delta} /></p>}
    </article>
  );
}

function Ring({ value, label }: { value: number; label: string }) {
  const safe = Math.max(0, Math.min(value, 100));
  return (
    <div className="flex items-center gap-4">
      <div className="relative grid h-28 w-28 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(var(--accent) ${safe * 3.6}deg, var(--surface-subtle) 0deg)` }}>
        <div className="grid h-[82px] w-[82px] place-items-center rounded-full bg-surface">
          <span className="text-xl font-bold tabular-nums text-foreground">{value.toFixed(0)}%</span>
        </div>
      </div>
      <div><p className="text-xs font-bold uppercase tracking-wider text-muted">{label}</p><p className="mt-1 text-sm text-foreground">Monthly target progress</p></div>
    </div>
  );
}

function SalesArea({ current, previous }: { current: number[]; previous: number[] }) {
  const width = 760, height = 260, pad = 24;
  const max = Math.max(...current, ...previous, 1);
  const points = (values: number[]) => values.map((v, i) => `${pad + (i * (width - pad * 2)) / Math.max(values.length - 1, 1)},${height - pad - (v / max) * (height - pad * 2)}`).join(' ');
  const currentPoints = points(current);
  return (
    <div className="overflow-hidden rounded-xl bg-surface-subtle/60 p-2">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[260px] w-full" role="img" aria-label="Cumulative sales comparison">
        {[0.25, 0.5, 0.75].map((n) => <line key={n} x1={pad} x2={width-pad} y1={height*n} y2={height*n} stroke="currentColor" className="text-border" strokeDasharray="4 5" />)}
        {currentPoints && <polygon points={`${pad},${height-pad} ${currentPoints} ${width-pad},${height-pad}`} fill="var(--accent)" opacity=".10" />}
        <polyline points={points(previous)} fill="none" stroke="currentColor" className="text-muted" opacity=".55" strokeWidth="2" strokeDasharray="7 6" />
        <polyline points={currentPoints} fill="none" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="flex justify-center gap-5 pb-2 text-xs font-medium text-muted"><span><i className="me-2 inline-block h-0.5 w-5 bg-accent align-middle" />Current year</span><span><i className="me-2 inline-block h-0.5 w-5 bg-muted align-middle" />Previous year</span></div>
    </div>
  );
}

export function PerformanceIntelligenceClient() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const requestedMonth = search.get('month') ?? '';
  const month = parseMonthKey(requestedMonth) ? requestedMonth : getCurrentMonthKeyRiyadh();
  const activeTab = (tabs.some((t) => t.id === search.get('view')) ? search.get('view') : 'overview') as Tab;
  const employee = search.get('employee') ?? 'all';
  const [current, setCurrent] = useState<Snapshot | null>(null);
  const [prior, setPrior] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const updateQuery = useCallback((patch: Record<string, string | null>) => {
    const params = new URLSearchParams(search.toString());
    Object.entries(patch).forEach(([key, value]) => value == null ? params.delete(key) : params.set(key, value));
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }, [pathname, router, search]);

  useEffect(() => {
    if (!parseMonthKey(requestedMonth)) updateQuery({ month });
  }, [month, requestedMonth, updateQuery]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(null);
    Promise.all([
      fetch(`/api/executive/month-snapshot?month=${month}`, { cache: 'no-store', signal: controller.signal }),
      fetch(`/api/executive/month-snapshot?month=${previousYear(month)}`, { cache: 'no-store', signal: controller.signal }),
    ]).then(async ([now, last]) => {
      if (!now.ok) throw new Error('Unable to load performance data');
      setCurrent(await now.json());
      setPrior(last.ok ? await last.json() : null);
    }).catch((e) => { if (e?.name !== 'AbortError') setError(e instanceof Error ? e.message : 'Unable to load'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [month]);

  const model = useMemo(() => {
    if (!current) return null;
    const total = current.daily.reduce((s, d) => s + sar(d.netSalesHalalas), 0);
    const invoices = current.daily.reduce((s, d) => s + d.invoices, 0);
    const pieces = current.daily.reduce((s, d) => s + d.pieces, 0);
    const target = sar(current.boutiqueTargetHalalas ?? 0);
    const priorTotal = prior?.daily.reduce((s, d) => s + sar(d.netSalesHalalas), 0) ?? 0;
    const yoy = priorTotal > 0 ? ((total / priorTotal) - 1) * 100 : null;
    const cumulative = (days: Day[] | undefined) => { let sum = 0; return (days ?? []).map((d) => (sum += sar(d.netSalesHalalas))); };
    const staff = current.staff.map((s) => ({
      ...s,
      sales: sar(s.netSalesHalalas),
      target: sar(s.targetHalalas ?? 0),
      achievement: s.achievementPct ?? (s.targetHalalas ? s.netSalesHalalas / s.targetHalalas * 100 : null),
      avt: ratio(sar(s.netSalesHalalas), s.invoices),
      avp: ratio(sar(s.netSalesHalalas), s.pieces),
      upt: ratio(s.pieces, s.invoices),
    })).sort((a, b) => b.sales - a.sales);
    const selected = employee === 'all' ? null : staff.find((s) => (s.empId ?? s.name) === employee) ?? null;
    const elapsed = Math.max(current.daily.filter((d) => d.netSalesHalalas || d.invoices || d.pieces).length, 1);
    const days = new Date(Number(month.slice(0,4)), Number(month.slice(5,7)), 0).getDate();
    const forecast = total / elapsed * days;
    return { total, target, invoices, pieces, priorTotal, yoy, staff, selected, forecast, cumulative: cumulative(current.daily), priorCumulative: cumulative(prior?.daily), achievement: ratio(total * 100, target), avt: ratio(total, invoices), avp: ratio(total, pieces), upt: ratio(pieces, invoices) };
  }, [current, prior, employee, month]);

  const exportCsv = () => {
    if (!current || !model) return;
    const rows: (string | number)[][] = [['Date','Sales SAR','Invoices','Pieces'], ...current.daily.map((d) => [d.date, sar(d.netSalesHalalas), d.invoices, d.pieces])];
    rows.push([], ['Employee','ID','Target SAR','Sales SAR','Achievement %','Invoices','Pieces']);
    model.staff.forEach((s) => rows.push([s.name, s.empId ?? '', s.target, s.sales, s.achievement ?? '', s.invoices, s.pieces]));
    const blob = new Blob([rows.map((r) => r.map(csvCell).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = url; link.download = `performance-intelligence-${month}.csv`; link.click(); URL.revokeObjectURL(url);
  };

  if (loading && !model) return <div className="p-8 text-sm text-muted">Loading intelligence workspace…</div>;
  if (error) return <div className="m-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>;
  if (!model || !current) return null;

  const selectedMetric = model.selected;
  return (
    <main className="mx-auto max-w-[1680px] space-y-4 p-4 md:p-6">
      <header className="relative overflow-hidden rounded-3xl border border-border bg-surface p-5 shadow-card md:p-6">
        <div className="absolute -end-20 -top-24 h-64 w-64 rounded-full bg-accent/10 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-5">
          <div><p className="text-[10px] font-bold uppercase tracking-[.2em] text-accent">Live decision workspace · {current.branchCode}</p><h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">Performance Intelligence</h1><p className="mt-1 text-sm text-muted">One visual view for sales, target and team momentum.</p></div>
          <div className="flex flex-wrap items-center gap-2">
            <button className="rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold hover:bg-surface-subtle" onClick={exportCsv}>⇩ Export data</button>
            <button aria-label="Previous month" className="h-10 rounded-xl border border-border px-3" onClick={() => updateQuery({ month: addMonths(month, -1) })}>←</button>
            <input aria-label="Report month" type="month" value={month} onChange={(e) => parseMonthKey(e.target.value) && updateQuery({ month: e.target.value })} className="h-10 rounded-xl border border-border bg-surface px-3 text-sm font-semibold" />
            <button aria-label="Next month" className="h-10 rounded-xl border border-border px-3" onClick={() => updateQuery({ month: addMonths(month, 1) })}>→</button>
          </div>
        </div>
        <nav className="relative mt-5 flex gap-1 overflow-x-auto rounded-xl bg-surface-subtle p-1" aria-label="Intelligence views">
          {tabs.map((tab) => <button key={tab.id} onClick={() => updateQuery({ view: tab.id })} className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition ${activeTab === tab.id ? 'bg-surface text-accent shadow-sm' : 'text-muted hover:text-foreground'}`}>{tab.label}</button>)}
        </nav>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Net Sales" value={formatSarInt(model.total)} delta={model.yoy} accent />
        <Metric label="Target Achievement" value={percent(model.achievement)} />
        <Metric label="Month-end Forecast" value={formatSarInt(model.forecast)} />
        <Metric label="YoY Change" value={model.yoy == null ? '—' : `${model.yoy >= 0 ? '+' : ''}${model.yoy.toFixed(1)}%`} />
      </section>

      {activeTab === 'overview' && <>
        <section className="grid gap-4 xl:grid-cols-[1.6fr_.8fr]">
          <article className="app-card p-5"><div className="mb-3 flex items-center justify-between"><div><h2 className="font-bold">Sales Momentum</h2><p className="text-xs text-muted">Cumulative comparison with {previousYear(month).slice(0,4)}</p></div><Delta value={model.yoy} /></div><SalesArea current={model.cumulative} previous={model.priorCumulative} /></article>
          <article className="app-card flex flex-col justify-between gap-5 p-5"><Ring value={model.achievement ?? 0} label="Achievement" /><div className="grid grid-cols-2 gap-2 border-t border-border pt-4"><div><p className="text-xs text-muted">Remaining</p><p className="mt-1 font-bold tabular-nums">{formatSarInt(Math.max(model.target-model.total,0))}</p></div><div><p className="text-xs text-muted">Forecast gap</p><p className="mt-1 font-bold tabular-nums">{formatSarInt(model.forecast-model.target)}</p></div></div></article>
        </section>
        <section className="grid gap-4 md:grid-cols-3">
          {[['AVT', model.avt == null ? '—' : formatSarInt(model.avt), `${model.invoices} invoices`], ['UPT', model.upt?.toFixed(2) ?? '—', `${model.pieces} pieces`], ['AVP', model.avp == null ? '—' : formatSarInt(model.avp), 'Average value per piece']].map(([a,b,c]) => <article key={a} className="app-card p-5"><p className="text-xs font-bold text-accent">{a}</p><p className="mt-2 text-3xl font-bold tabular-nums">{b}</p><p className="mt-1 text-xs text-muted">{c}</p></article>)}
        </section>
      </>}

      {activeTab === 'trends' && <section className="grid gap-4 xl:grid-cols-[1.7fr_.7fr]"><article className="app-card p-5"><h2 className="font-bold">Daily Sales Pattern</h2><p className="mb-4 text-xs text-muted">Click another month above to move through time.</p><SalesArea current={current.daily.map((d)=>sar(d.netSalesHalalas))} previous={prior?.daily.map((d)=>sar(d.netSalesHalalas)) ?? []} /></article><article className="app-card p-5"><h2 className="font-bold">Period Signals</h2><div className="mt-5 space-y-4">{[['Best day', [...current.daily].sort((a,b)=>b.netSalesHalalas-a.netSalesHalalas)[0]], ['Invoices', model.invoices], ['Pieces', model.pieces]].map(([label,value]) => <div key={String(label)} className="border-b border-border pb-4"><p className="text-xs text-muted">{String(label)}</p><p className="mt-1 text-xl font-bold">{typeof value === 'object' ? `${value.date} · ${formatSarInt(sar(value.netSalesHalalas))}` : String(value)}</p></div>)}</div></article></section>}

      {activeTab === 'team' && <section className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]"><article className="app-card p-5"><div className="flex items-center justify-between"><div><h2 className="font-bold">Team Contribution</h2><p className="text-xs text-muted">Select a person to cross-filter the spotlight.</p></div><button onClick={() => updateQuery({ employee: null })} className="text-xs font-semibold text-accent">Clear filter</button></div><div className="mt-5 space-y-3">{model.staff.map((s) => { const key=s.empId??s.name; const share=ratio(s.sales*100,model.total)??0; return <button key={key} onClick={()=>updateQuery({employee:key})} className={`w-full rounded-xl border p-3 text-left transition ${employee===key?'border-accent bg-accent-soft':'border-border hover:bg-surface-subtle'}`}><div className="mb-2 flex justify-between gap-3"><span className="font-semibold">{s.name}</span><span className="font-bold tabular-nums">{formatSarInt(s.sales)}</span></div><div className="h-2 overflow-hidden rounded-full bg-surface-subtle"><div className="h-full rounded-full bg-accent" style={{width:`${Math.min(share,100)}%`}} /></div><p className="mt-1 text-xs text-muted">{share.toFixed(1)}% contribution · {percent(s.achievement)} target</p></button>})}</div></article><article className="app-card p-5"><p className="text-xs font-bold uppercase tracking-wider text-accent">Employee Spotlight</p>{selectedMetric ? <div className="mt-4"><h2 className="text-2xl font-bold">{selectedMetric.name}</h2><p className="text-sm text-muted">{selectedMetric.empId??'—'}</p><div className="mt-6 grid grid-cols-2 gap-3">{[['Sales',formatSarInt(selectedMetric.sales)],['Achievement',percent(selectedMetric.achievement)],['AVT',selectedMetric.avt?formatSarInt(selectedMetric.avt):'—'],['UPT',selectedMetric.upt?.toFixed(2)??'—']].map(([a,b])=><div key={a} className="rounded-xl bg-surface-subtle p-3"><p className="text-xs text-muted">{a}</p><p className="mt-1 font-bold">{b}</p></div>)}</div></div> : <div className="grid min-h-64 place-items-center text-center text-sm text-muted">Select an employee to reveal their performance profile.</div>}</article></section>}

      {activeTab === 'detail' && <section className="app-card overflow-hidden"><div className="border-b border-border p-5"><h2 className="font-bold">Daily Detail</h2><p className="text-xs text-muted">Official source rows for the selected month.</p></div><div className="max-h-[640px] overflow-auto"><table className="w-full min-w-[760px] text-sm"><thead className="sticky top-0 bg-surface-subtle text-xs uppercase text-muted"><tr><th className="px-4 py-3 text-left">Date</th><th className="px-4 py-3 text-right">Sales</th><th className="px-4 py-3 text-right">Invoices</th><th className="px-4 py-3 text-right">Pieces</th><th className="px-4 py-3 text-right">AVT</th><th className="px-4 py-3 text-right">UPT</th></tr></thead><tbody>{current.daily.map((d)=><tr key={d.date} className="border-t border-border/70 hover:bg-surface-subtle"><td className="px-4 py-3 font-medium">{d.date}</td><td className="px-4 py-3 text-right font-semibold tabular-nums">{d.netSalesHalalas?formatSarInt(sar(d.netSalesHalalas)):''}</td><td className="px-4 py-3 text-right">{d.invoices||''}</td><td className="px-4 py-3 text-right">{d.pieces||''}</td><td className="px-4 py-3 text-right">{d.invoices?formatSarInt(sar(d.netSalesHalalas)/d.invoices):''}</td><td className="px-4 py-3 text-right">{d.invoices?(d.pieces/d.invoices).toFixed(2):''}</td></tr>)}</tbody></table></div></section>}
    </main>
  );
}
