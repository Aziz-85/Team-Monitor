'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { addMonths, getCurrentMonthKeyRiyadh, parseMonthKey } from '@/lib/time';
import { formatSarInt } from '@/lib/utils/money';

type Day = { date: string; netSalesHalalas: number; invoices: number; pieces: number };
type Staff = { empId?: string; name: string; netSalesHalalas: number; invoices: number; pieces: number; targetHalalas?: number; achievementPct?: number };
type MonthlyPoint = { month: string; netSalesHalalas: number; targetHalalas: number; invoices: number; pieces: number };
type StaffDay = Day & { empId?: string };
type Snapshot = { from: string; to: string; branchCode: string; targetHalalas: number; monthly: MonthlyPoint[]; daily: Day[]; staffDaily: StaffDay[]; staff: Staff[] };
type YearPoint = { year: string; sales: number; target: number };
type Tab = 'overview' | 'trends' | 'team' | 'detail';
type Period = 'month' | 'quarter' | 'half' | 'year' | 'custom';

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

function resolveRange(anchor: string, period: Period, customFrom: string, customTo: string) {
  if (period === 'custom' && parseMonthKey(customFrom) && parseMonthKey(customTo) && customFrom <= customTo) return { from: customFrom, to: customTo };
  const year = anchor.slice(0, 4);
  const monthNo = Number(anchor.slice(5));
  if (period === 'year') return { from: `${year}-01`, to: `${year}-12` };
  if (period === 'half') {
    const start = monthNo <= 6 ? 1 : 7;
    return { from: `${year}-${String(start).padStart(2, '0')}`, to: `${year}-${String(start + 5).padStart(2, '0')}` };
  }
  if (period === 'quarter') {
    const start = Math.floor((monthNo - 1) / 3) * 3 + 1;
    return { from: `${year}-${String(start).padStart(2, '0')}`, to: `${year}-${String(start + 2).padStart(2, '0')}` };
  }
  return { from: anchor, to: anchor };
}

function csvCell(value: string | number) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function Delta({ value, suffix = '%' }: { value: number | null; suffix?: string }) {
  if (value == null) return <span className="text-muted">No comparison</span>;
  const positive = value >= 0;
  return <span className={positive ? 'text-emerald-700' : 'text-rose-700'}>{positive ? '↗' : '↘'} {Math.abs(value).toFixed(1)}{suffix}</span>;
}

function Metric({ label, value, delta, accent = false, index = 0 }: { label: string; value: string; delta?: number | null; accent?: boolean; index?: number }) {
  const marks = ['01', '02', '03', '04'];
  return (
    <article className={`group relative min-h-36 overflow-hidden rounded-[26px] border p-5 shadow-[0_18px_55px_-36px_rgba(15,23,42,.8)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_24px_65px_-34px_rgba(15,23,42,.9)] ${accent ? 'border-white/10 bg-[linear-gradient(135deg,#0b2447_0%,#123867_58%,#167c73_130%)] text-white' : 'border-border/80 bg-surface/95'}`}>
      <div className={`absolute -end-10 -top-12 h-28 w-28 rounded-full border ${accent ? 'border-white/10 bg-white/5' : 'border-accent/10 bg-accent/5'} transition duration-500 group-hover:scale-125`} />
      <div className="relative flex items-start justify-between gap-3">
        <p className={`text-[10px] font-extrabold uppercase tracking-[0.18em] ${accent ? 'text-white/65' : 'text-muted'}`}>{label}</p>
        <span className={`grid h-7 w-7 place-items-center rounded-full text-[9px] font-black tracking-wider ${accent ? 'bg-white/10 text-white/70' : 'bg-surface-subtle text-muted'}`}>{marks[index] ?? '•'}</span>
      </div>
      <p className="relative mt-5 text-[clamp(1.45rem,2.1vw,2rem)] font-black tracking-[-.04em] tabular-nums">{value}</p>
      {delta !== undefined && <p className={`relative mt-2 text-xs font-bold ${accent ? 'text-white/80' : ''}`}>{accent ? (delta == null ? 'No comparison' : `${delta >= 0 ? '↗' : '↘'} ${Math.abs(delta).toFixed(1)}% vs LY`) : <Delta value={delta} />}</p>}
    </article>
  );
}

function Ring({ value, label }: { value: number; label: string }) {
  const safe = Math.max(0, Math.min(value, 100));
  return (
    <div className="flex items-center gap-5">
      <div className="relative grid h-32 w-32 shrink-0 place-items-center rounded-full p-2 shadow-[0_16px_40px_-24px_var(--accent)]" style={{ background: `conic-gradient(var(--accent) ${safe * 3.6}deg, var(--surface-subtle) 0deg)` }}>
        <div className="grid h-full w-full place-items-center rounded-full border border-border/60 bg-surface shadow-inner">
          <div className="text-center"><span className="block text-2xl font-black tabular-nums text-foreground">{value.toFixed(0)}%</span><span className="text-[9px] font-bold uppercase tracking-[.18em] text-muted">Complete</span></div>
        </div>
      </div>
      <div><p className="text-xs font-black uppercase tracking-[.16em] text-accent">{label}</p><p className="mt-2 max-w-40 text-sm leading-6 text-muted">Selected-period progress against the assigned target.</p></div>
    </div>
  );
}

function SalesArea({ current, previous }: { current: number[]; previous: number[] }) {
  const width = 760, height = 260, pad = 24;
  const max = Math.max(...current, ...previous, 1);
  const points = (values: number[]) => values.map((v, i) => `${pad + (i * (width - pad * 2)) / Math.max(values.length - 1, 1)},${height - pad - (v / max) * (height - pad * 2)}`).join(' ');
  const currentPoints = points(current);
  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-[linear-gradient(180deg,var(--surface-subtle),transparent)] p-3">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[260px] w-full" role="img" aria-label="Cumulative sales comparison">
        <defs><linearGradient id="salesGlow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--accent)" stopOpacity=".32"/><stop offset="1" stopColor="var(--accent)" stopOpacity=".01"/></linearGradient><filter id="softGlow"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
        {[0.25, 0.5, 0.75].map((n) => <line key={n} x1={pad} x2={width-pad} y1={height*n} y2={height*n} stroke="currentColor" className="text-border" strokeDasharray="4 5" />)}
        {currentPoints && <polygon points={`${pad},${height-pad} ${currentPoints} ${width-pad},${height-pad}`} fill="url(#salesGlow)" />}
        <polyline points={points(previous)} fill="none" stroke="currentColor" className="text-muted" opacity=".55" strokeWidth="2" strokeDasharray="7 6" />
        <polyline points={currentPoints} fill="none" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" filter="url(#softGlow)" />
        {current.map((value, i) => { const x = pad + (i * (width - pad * 2)) / Math.max(current.length - 1, 1); const y = height - pad - (value / max) * (height - pad * 2); return <circle key={i} cx={x} cy={y} r="4" fill="var(--accent)"><title>{formatSarInt(value)}</title></circle>; })}
        <text x={pad} y={14} fill="currentColor" className="text-muted" fontSize="10">{formatSarInt(max)}</text>
        <text x={pad} y={height-7} fill="currentColor" className="text-muted" fontSize="10">0</text>
      </svg>
      <div className="flex justify-center gap-5 pb-2 text-xs font-medium text-muted"><span><i className="me-2 inline-block h-0.5 w-5 bg-accent align-middle" />Current year</span><span><i className="me-2 inline-block h-0.5 w-5 bg-muted align-middle" />Previous year</span></div>
    </div>
  );
}

function YearComparison({ data }: { data: YearPoint[] }) {
  const max = Math.max(...data.flatMap((row) => [row.sales, row.target]), 1);
  return <div className="mt-4 flex min-h-56 items-end gap-3 overflow-x-auto rounded-xl bg-surface-subtle/60 p-4">{data.map((row) => <div key={row.year} className="flex min-w-20 flex-1 flex-col items-center gap-2"><div className="flex h-40 items-end gap-1.5"><div title={`Sales ${formatSarInt(row.sales)}`} className="w-6 rounded-t-md bg-accent" style={{height:`${Math.max(3,row.sales/max*100)}%`}} /><div title={`Target ${formatSarInt(row.target)}`} className="w-6 rounded-t-md bg-muted/30" style={{height:`${Math.max(3,row.target/max*100)}%`}} /></div><span className="text-xs font-bold">{row.year}</span><span className="text-[10px] text-muted">{row.target ? percent(row.sales/row.target*100,0) : '—'}</span></div>)}</div>;
}

export function PerformanceIntelligenceClient() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const requestedMonth = search.get('month') ?? '';
  const month = parseMonthKey(requestedMonth) ? requestedMonth : getCurrentMonthKeyRiyadh();
  const period = (['month', 'quarter', 'half', 'year', 'custom'].includes(search.get('period') ?? '') ? search.get('period') : 'month') as Period;
  const customFrom = parseMonthKey(search.get('from') ?? '') ? search.get('from')! : month;
  const customTo = parseMonthKey(search.get('to') ?? '') ? search.get('to')! : month;
  const range = resolveRange(month, period, customFrom, customTo);
  const priorRange = { from: previousYear(range.from), to: previousYear(range.to) };
  const currentMonthKey = getCurrentMonthKeyRiyadh();
  const includesCurrentPeriod = range.from <= currentMonthKey && range.to >= currentMonthKey;
  const riyadhDay = Number(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' }).slice(8, 10));
  const priorCutoffDate = new Date(`${previousYear(currentMonthKey)}-${String(riyadhDay).padStart(2, '0')}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const activeTab = (tabs.some((t) => t.id === search.get('view')) ? search.get('view') : 'overview') as Tab;
  const employee = search.get('employee') ?? 'all';
  const [current, setCurrent] = useState<Snapshot | null>(null);
  const [prior, setPrior] = useState<Snapshot | null>(null);
  const [yearHistory, setYearHistory] = useState<YearPoint[]>([]);
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
    const currentMonth = getCurrentMonthKeyRiyadh();
    const includesCurrent = range.from <= currentMonth && range.to >= currentMonth;
    const currentDay = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' }).slice(8, 10);
    const currentSalesTo = includesCurrent ? currentMonth : range.to;
    const priorSalesTo = includesCurrent ? previousYear(currentMonth) : priorRange.to;
    Promise.all([
      fetch(`/api/analytics/performance-intelligence?from=${range.from}&to=${range.to}&salesTo=${currentSalesTo}&throughDay=${includesCurrent ? currentDay : 31}`, { cache: 'no-store', signal: controller.signal }),
      fetch(`/api/analytics/performance-intelligence?from=${priorRange.from}&to=${priorRange.to}&salesTo=${priorSalesTo}&throughDay=${includesCurrent ? currentDay : 31}`, { cache: 'no-store', signal: controller.signal }),
      fetch('/api/analytics/performance-intelligence?mode=years', { cache: 'no-store', signal: controller.signal }),
    ]).then(async ([now, last, years]) => {
      if (!now.ok) throw new Error('Unable to load performance data');
      setCurrent(await now.json());
      setPrior(last.ok ? await last.json() : null);
      setYearHistory(years.ok ? (await years.json()).years ?? [] : []);
    }).catch((e) => { if (e?.name !== 'AbortError') setError(e instanceof Error ? e.message : 'Unable to load'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [range.from, range.to, priorRange.from, priorRange.to]);

  const model = useMemo(() => {
    if (!current) return null;
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
    const selectedDaily = selected ? current.staffDaily.filter((d) => d.empId === selected.empId) : current.daily;
    const priorSelected = selected ? prior?.staff.find((s) => s.empId === selected.empId) : null;
    const total = selected?.sales ?? current.daily.reduce((s, d) => s + sar(d.netSalesHalalas), 0);
    const invoices = selected?.invoices ?? current.daily.reduce((s, d) => s + d.invoices, 0);
    const pieces = selected?.pieces ?? current.daily.reduce((s, d) => s + d.pieces, 0);
    const target = selected?.target ?? sar(current.targetHalalas ?? 0);
    const priorTotal = priorSelected ? sar(priorSelected.netSalesHalalas) : prior?.daily.reduce((s, d) => s + sar(d.netSalesHalalas), 0) ?? 0;
    const yoy = priorTotal > 0 ? ((total / priorTotal) - 1) * 100 : null;
    const showDaily = range.from === range.to;
    const seriesRows = selected ? selectedDaily : showDaily ? current.daily : current.monthly;
    const priorSeriesRows = priorSelected ? prior?.staffDaily.filter((d) => d.empId === selected?.empId) : showDaily ? prior?.daily : prior?.monthly;
    const cumulative = (rows: { netSalesHalalas: number }[] | undefined) => { let sum = 0; return (rows ?? []).map((d) => (sum += sar(d.netSalesHalalas))); };
    const daysInPeriod = current.monthly.reduce((sum, row) => sum + new Date(Number(row.month.slice(0,4)), Number(row.month.slice(5)), 0).getDate(), 0);
    const elapsedCalendarDays = Math.max(1, Number(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' }).slice(8, 10)));
    const forecast = period === 'month' && month === getCurrentMonthKeyRiyadh() ? total / elapsedCalendarDays * daysInPeriod : total;
    return { total, target, invoices, pieces, priorTotal, yoy, staff, selected, selectedDaily, showDaily, forecast, cumulative: cumulative(seriesRows), priorCumulative: cumulative(priorSeriesRows), achievement: ratio(total * 100, target), avt: ratio(total, invoices), avp: ratio(total, pieces), upt: ratio(pieces, invoices) };
  }, [current, prior, employee, month, period, range.from, range.to]);

  const exportCsv = () => {
    if (!current || !model) return;
    const rows: (string | number)[][] = [['Date','Sales SAR','Invoices','Pieces'], ...current.daily.map((d) => [d.date, sar(d.netSalesHalalas), d.invoices, d.pieces])];
    rows.push([], ['Employee','ID','Target SAR','Sales SAR','Achievement %','Invoices','Pieces']);
    model.staff.forEach((s) => rows.push([s.name, s.empId ?? '', s.target, s.sales, s.achievement ?? '', s.invoices, s.pieces]));
    const blob = new Blob([rows.map((r) => r.map(csvCell).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = url; link.download = `performance-intelligence-${range.from}-to-${range.to}.csv`; link.click(); URL.revokeObjectURL(url);
  };

  if (loading && !model) return <div className="p-8 text-sm text-muted">Loading intelligence workspace…</div>;
  if (error) return <div className="m-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>;
  if (!model || !current) return null;

  const selectedMetric = model.selected;
  return (
    <main className="relative mx-auto max-w-[1680px] space-y-5 overflow-hidden p-4 md:p-6">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[560px] bg-[radial-gradient(circle_at_78%_8%,color-mix(in_srgb,var(--accent)_16%,transparent),transparent_32%),radial-gradient(circle_at_12%_16%,rgba(45,98,155,.12),transparent_30%)]" />
      <header className="relative overflow-hidden rounded-[34px] border border-white/10 bg-[linear-gradient(118deg,#081b33_0%,#102e53_48%,#124d5b_115%)] p-5 text-white shadow-[0_30px_80px_-38px_rgba(3,18,38,.9)] md:p-7">
        <div className="pointer-events-none absolute -end-16 -top-28 h-80 w-80 rounded-full border border-white/[.07] bg-white/[.035]" />
        <div className="pointer-events-none absolute end-20 top-5 h-40 w-40 rounded-full border border-white/[.06]" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-xl"><div className="mb-4 flex items-center gap-2"><span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-60"/><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-300"/></span><p className="text-[10px] font-extrabold uppercase tracking-[.24em] text-white/60">Live intelligence · {current.branchCode}</p></div><h1 className="text-3xl font-black tracking-[-.045em] md:text-[2.65rem] md:leading-none">Performance Intelligence</h1><p className="mt-3 text-sm leading-6 text-white/60">A focused view of sales velocity, target progress and team impact.</p></div>
          <div className="flex flex-wrap items-center gap-2">
            <button className="h-11 rounded-2xl border border-white/15 bg-white/10 px-4 text-sm font-bold backdrop-blur transition hover:bg-white/15" onClick={exportCsv}>↓ Export</button>
            <select aria-label="Period type" value={period} onChange={(e) => updateQuery({ period: e.target.value, employee: null })} className="h-11 rounded-2xl border border-white/15 bg-white/10 px-4 text-sm font-bold text-white backdrop-blur [color-scheme:dark]">
              <option value="month">Monthly</option><option value="quarter">Quarterly</option><option value="half">Half-year</option><option value="year">Annual</option><option value="custom">Custom range</option>
            </select>
            {period === 'custom' ? <>
              <input aria-label="From month" type="month" value={customFrom} onChange={(e) => parseMonthKey(e.target.value) && updateQuery({ from: e.target.value })} className="h-11 rounded-2xl border border-white/15 bg-white/10 px-3 text-sm font-bold text-white [color-scheme:dark]" />
              <span className="text-xs text-white/40">to</span>
              <input aria-label="To month" type="month" value={customTo} onChange={(e) => parseMonthKey(e.target.value) && updateQuery({ to: e.target.value })} className="h-11 rounded-2xl border border-white/15 bg-white/10 px-3 text-sm font-bold text-white [color-scheme:dark]" />
            </> : <>
              <button aria-label="Previous period" className="grid h-11 w-11 place-items-center rounded-2xl border border-white/15 bg-white/10 text-lg transition hover:bg-white/15" onClick={() => updateQuery({ month: addMonths(month, period === 'year' ? -12 : period === 'half' ? -6 : period === 'quarter' ? -3 : -1) })}>←</button>
              <input aria-label="Anchor month" type="month" value={month} onChange={(e) => parseMonthKey(e.target.value) && updateQuery({ month: e.target.value })} className="h-11 rounded-2xl border border-white/15 bg-white/10 px-3 text-sm font-bold text-white [color-scheme:dark]" />
              <button aria-label="Next period" className="grid h-11 w-11 place-items-center rounded-2xl border border-white/15 bg-white/10 text-lg transition hover:bg-white/15" onClick={() => updateQuery({ month: addMonths(month, period === 'year' ? 12 : period === 'half' ? 6 : period === 'quarter' ? 3 : 1) })}>→</button>
            </>}
          </div>
        </div>
        <div className="relative mt-6 flex flex-wrap items-center gap-2 text-xs text-white/45"><span className="rounded-full border border-white/10 bg-white/[.07] px-3 py-1.5 font-bold text-white/80">{range.from} → {range.to}</span><span>{includesCurrentPeriod ? `Compared through ${priorCutoffDate}` : `Compared with ${priorRange.from} → ${priorRange.to}`}</span></div>
        <nav className="relative mt-6 flex gap-1 overflow-x-auto rounded-2xl border border-white/10 bg-black/10 p-1.5 backdrop-blur" aria-label="Intelligence views">
          {tabs.map((tab) => <button key={tab.id} onClick={() => updateQuery({ view: tab.id })} className={`whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-bold transition ${activeTab === tab.id ? 'bg-white text-[#102e53] shadow-lg' : 'text-white/55 hover:bg-white/[.07] hover:text-white'}`}>{tab.label}</button>)}
        </nav>
      </header>

      {model.selected && <div className="flex items-center justify-between rounded-xl border border-accent/25 bg-accent-soft px-4 py-2 text-sm"><span>Filtered by <strong>{model.selected.name}</strong></span><button onClick={() => updateQuery({ employee: null })} className="font-bold text-accent">Clear filter ×</button></div>}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric index={0} label="Net Sales" value={formatSarInt(model.total)} delta={model.yoy} accent />
        <Metric index={1} label="Target Achievement" value={percent(model.achievement)} />
        <Metric index={2} label={period === 'month' && month === getCurrentMonthKeyRiyadh() ? 'Month-end Forecast' : model.total >= model.target ? 'Above Target' : 'Remaining'} value={period === 'month' && month === getCurrentMonthKeyRiyadh() ? formatSarInt(model.forecast) : formatSarInt(Math.abs(model.total-model.target))} />
        <Metric index={3} label="YoY Change" value={model.yoy == null ? '—' : `${model.yoy >= 0 ? '+' : ''}${model.yoy.toFixed(1)}%`} />
      </section>

      {activeTab === 'overview' && <>
        <section className="grid gap-4 xl:grid-cols-[1.6fr_.8fr]">
          <article className="app-card rounded-[28px] p-5 md:p-6"><div className="mb-5 flex items-center justify-between"><div><p className="mb-1 text-[10px] font-black uppercase tracking-[.18em] text-accent">Revenue pulse</p><h2 className="text-lg font-black tracking-tight">Sales Momentum</h2><p className="text-xs text-muted">Selected period compared with the same period last year</p></div><div className="rounded-full bg-surface-subtle px-3 py-2 text-xs font-bold"><Delta value={model.yoy} /></div></div><SalesArea current={model.cumulative} previous={model.priorCumulative} /></article>
          <article className="app-card flex flex-col justify-between gap-5 rounded-[28px] p-6"><div><p className="mb-5 text-[10px] font-black uppercase tracking-[.18em] text-accent">Target pulse</p><Ring value={model.achievement ?? 0} label="Achievement" /></div><div className="grid grid-cols-2 gap-3 border-t border-border pt-5"><div className="rounded-2xl bg-surface-subtle p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-muted">Remaining</p><p className="mt-1 font-black tabular-nums">{formatSarInt(Math.max(model.target-model.total,0))}</p></div><div className="rounded-2xl bg-surface-subtle p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-muted">Vs target</p><p className="mt-1 font-black tabular-nums">{formatSarInt(model.forecast-model.target)}</p></div></div></article>
        </section>
        <section className="grid gap-4 md:grid-cols-3">
          {[['AVT', model.avt == null ? '—' : formatSarInt(model.avt), `${model.invoices} invoices`], ['UPT', model.upt?.toFixed(2) ?? '—', `${model.pieces} pieces`], ['AVP', model.avp == null ? '—' : formatSarInt(model.avp), 'Average value per piece']].map(([a,b,c], i) => <article key={a} className="app-card group relative overflow-hidden rounded-[26px] p-5"><span className="absolute end-4 top-4 text-4xl font-black text-accent/[.06]">0{i+1}</span><p className="text-[10px] font-black uppercase tracking-[.2em] text-accent">{a}</p><p className="mt-4 text-3xl font-black tracking-[-.04em] tabular-nums">{b}</p><p className="mt-2 text-xs text-muted">{c}</p><div className="absolute inset-x-0 bottom-0 h-1 origin-left scale-x-0 bg-accent transition group-hover:scale-x-100" /></article>)}
        </section>
      </>}

      {activeTab === 'trends' && <><section className="grid gap-4 xl:grid-cols-[1.7fr_.7fr]"><article className="app-card p-5"><h2 className="font-bold">{model.showDaily || model.selected ? 'Daily' : 'Monthly'} Sales Pattern</h2><p className="mb-4 text-xs text-muted">Hover a point to see its value. Employee selection filters this chart.</p><SalesArea current={(model.selected ? model.selectedDaily : model.showDaily ? current.daily : current.monthly).map((d)=>sar(d.netSalesHalalas))} previous={(model.selected ? prior?.staffDaily.filter((d)=>d.empId===model.selected?.empId) : model.showDaily ? prior?.daily : prior?.monthly)?.map((d)=>sar(d.netSalesHalalas)) ?? []} /></article><article className="app-card p-5"><h2 className="font-bold">Period Signals</h2><div className="mt-5 space-y-4">{[['Best day', [...model.selectedDaily].sort((a,b)=>b.netSalesHalalas-a.netSalesHalalas)[0]], ['Invoices', model.invoices], ['Pieces', model.pieces]].map(([label,value]) => <div key={String(label)} className="border-b border-border pb-4"><p className="text-xs text-muted">{String(label)}</p><p className="mt-1 text-xl font-bold">{typeof value === 'object' && value ? `${value.date} · ${formatSarInt(sar(value.netSalesHalalas))}` : String(value ?? '—')}</p></div>)}</div></article></section><article className="app-card p-5"><h2 className="font-bold">All Years</h2><p className="text-xs text-muted">Annual sales and target comparison across every available year.</p><YearComparison data={yearHistory} /></article></>}

      {activeTab === 'team' && <section className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]"><article className="app-card rounded-[28px] p-5 md:p-6"><div className="flex items-center justify-between"><div><p className="mb-1 text-[10px] font-black uppercase tracking-[.18em] text-accent">Leaderboard</p><h2 className="text-lg font-black">Team Contribution</h2><p className="text-xs text-muted">Select a person to cross-filter the spotlight.</p></div><button onClick={() => updateQuery({ employee: null })} className="rounded-full bg-surface-subtle px-3 py-2 text-xs font-bold text-accent">Clear filter</button></div><div className="mt-5 space-y-3">{model.staff.map((s, i) => { const key=s.empId??s.name; const share=ratio(s.sales*100,model.total)??0; return <button key={key} onClick={()=>updateQuery({employee:key})} className={`group w-full rounded-2xl border p-4 text-left transition duration-300 hover:-translate-y-0.5 ${employee===key?'border-accent bg-accent-soft shadow-[0_12px_30px_-22px_var(--accent)]':'border-border/80 hover:bg-surface-subtle'}`}><div className="flex items-center gap-4"><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-xs font-black ${i===0?'bg-[linear-gradient(135deg,#f2d17b,#b88724)] text-white':'bg-surface-subtle text-muted'}`}>#{i+1}</span><div className="min-w-0 flex-1"><div className="mb-2 flex justify-between gap-3"><span className="truncate font-bold">{s.name}</span><span className="font-black tabular-nums">{formatSarInt(s.sales)}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-surface-subtle"><div className="h-full rounded-full bg-[linear-gradient(90deg,var(--accent),#42b5a6)] transition-all duration-700" style={{width:`${Math.min(share,100)}%`}} /></div><p className="mt-2 text-[11px] text-muted">{share.toFixed(1)}% contribution · {percent(s.achievement)} target</p></div></div></button>})}</div></article><article className="app-card relative overflow-hidden rounded-[28px] p-6"><div className="absolute -end-16 -top-16 h-44 w-44 rounded-full bg-accent/10 blur-3xl"/><p className="relative text-[10px] font-black uppercase tracking-[.2em] text-accent">Employee Spotlight</p>{selectedMetric ? <div className="relative mt-5"><div className="grid h-16 w-16 place-items-center rounded-2xl bg-[linear-gradient(135deg,#102e53,var(--accent))] text-xl font-black text-white shadow-lg">{selectedMetric.name.split(' ').map(n=>n[0]).slice(0,2).join('')}</div><h2 className="mt-4 text-2xl font-black tracking-tight">{selectedMetric.name}</h2><p className="text-sm text-muted">ID {selectedMetric.empId??'—'}</p><div className="mt-6 grid grid-cols-2 gap-3">{[['Sales',formatSarInt(selectedMetric.sales)],['Achievement',percent(selectedMetric.achievement)],['AVT',selectedMetric.avt?formatSarInt(selectedMetric.avt):'—'],['UPT',selectedMetric.upt?.toFixed(2)??'—']].map(([a,b])=><div key={a} className="rounded-2xl border border-border/70 bg-surface-subtle/70 p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-muted">{a}</p><p className="mt-2 text-lg font-black">{b}</p></div>)}</div></div> : <div className="relative grid min-h-72 place-items-center text-center"><div><div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full border border-dashed border-accent/40 bg-accent/5 text-2xl text-accent">＋</div><p className="text-sm font-bold">Select an employee</p><p className="mt-1 text-xs text-muted">Reveal their performance profile.</p></div></div>}</article></section>}

      {activeTab === 'detail' && <section className="app-card overflow-hidden"><div className="border-b border-border p-5"><h2 className="font-bold">Daily Detail</h2><p className="text-xs text-muted">Official source rows for the selected period{model.selected ? ` · ${model.selected.name}` : ''}.</p></div><div className="max-h-[640px] overflow-auto"><table className="w-full min-w-[760px] text-sm"><thead className="sticky top-0 bg-surface-subtle text-xs uppercase text-muted"><tr><th className="px-4 py-3 text-left">Date</th><th className="px-4 py-3 text-right">Sales</th><th className="px-4 py-3 text-right">Invoices</th><th className="px-4 py-3 text-right">Pieces</th><th className="px-4 py-3 text-right">AVT</th><th className="px-4 py-3 text-right">UPT</th></tr></thead><tbody>{model.selectedDaily.map((d)=><tr key={d.date} className="border-t border-border/70 hover:bg-surface-subtle"><td className="px-4 py-3 font-medium">{d.date}</td><td className="px-4 py-3 text-right font-semibold tabular-nums">{d.netSalesHalalas?formatSarInt(sar(d.netSalesHalalas)):''}</td><td className="px-4 py-3 text-right">{d.invoices||''}</td><td className="px-4 py-3 text-right">{d.pieces||''}</td><td className="px-4 py-3 text-right">{d.invoices?formatSarInt(sar(d.netSalesHalalas)/d.invoices):''}</td><td className="px-4 py-3 text-right">{d.invoices?(d.pieces/d.invoices).toFixed(2):''}</td></tr>)}</tbody></table></div></section>}
    </main>
  );
}
