'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';

export type AreaBoutiqueRow = {
  id: string;
  code: string;
  name: string;
  target: number;
  actual: number;
  achievement: number;
  employees: number;
  invoices: number;
  pieces: number;
};

const money = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export function AreaDashboardClient({
  month,
  rows,
  pendingLeaves,
}: {
  month: string;
  rows: AreaBoutiqueRow[];
  pendingLeaves: number;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>(rows.map((row) => row.id));
  const selectedRows = useMemo(
    () => rows.filter((row) => selectedIds.includes(row.id)),
    [rows, selectedIds]
  );
  const totals = useMemo(() => {
    const target = selectedRows.reduce((sum, row) => sum + row.target, 0);
    const sales = selectedRows.reduce((sum, row) => sum + row.actual, 0);
    const invoices = selectedRows.reduce((sum, row) => sum + row.invoices, 0);
    const pieces = selectedRows.reduce((sum, row) => sum + row.pieces, 0);
    return {
      target,
      sales,
      invoices,
      pieces,
      achievement: target > 0 ? (sales / target) * 100 : 0,
      remaining: Math.max(0, target - sales),
      avt: invoices > 0 ? sales / invoices : 0,
      upt: invoices > 0 ? pieces / invoices : 0,
    };
  }, [selectedRows]);

  function toggleBoutique(id: string) {
    setSelectedIds((current) => {
      if (current.includes(id)) {
        if (current.length <= 2 && rows.length >= 2) return current;
        return current.filter((value) => value !== id);
      }
      return [...current, id];
    });
  }

  const ranked = [...selectedRows].sort((a, b) => b.achievement - a.achievement);
  const selectionHint = rows.length >= 2 && selectedIds.length <= 2
    ? 'Two boutiques are kept selected so the comparison remains meaningful.'
    : 'Select the boutiques whose numbers you want to compare.';

  return (
    <div className="mx-auto max-w-[1580px] space-y-6 p-4 md:p-7">
      <section className="relative overflow-hidden rounded-[32px] bg-[linear-gradient(122deg,#0b294b_0%,#124c67_58%,#0b746d_120%)] p-6 text-white shadow-[0_30px_80px_-42px_rgba(6,29,58,.95)] md:p-8">
        <div className="pointer-events-none absolute -end-24 -top-32 h-96 w-96 rounded-full border border-white/10 bg-white/[.04]" />
        <div className="relative flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.24em] text-cyan-200">Area command center · {month}</p>
            <h1 className="mt-3 text-3xl font-black md:text-4xl">Regional performance dashboard</h1>
            <p className="mt-2 max-w-2xl text-sm text-white/70">Compare selected boutiques, spot the gap, and focus support where it will have the greatest impact.</p>
          </div>
          <Link href="/notifications" className="rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-900 shadow-sm">Open notifications</Link>
        </div>
        <div className="relative mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            ['Selected sales', `${money.format(totals.sales)} SAR`],
            ['Selected target', `${money.format(totals.target)} SAR`],
            ['Achievement', `${totals.achievement.toFixed(1)}%`],
            ['Remaining', `${money.format(totals.remaining)} SAR`],
            ['Pending leaves', String(pendingLeaves)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
              <p className="text-[11px] font-bold uppercase tracking-wider text-white/60">{label}</p>
              <p className="mt-2 text-2xl font-black tabular-nums">{value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-border bg-surface-elevated p-5 shadow-sm md:p-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.2em] text-accent">Boutique scope</p>
            <h2 className="mt-1 text-xl font-bold text-foreground">Choose boutiques to compare</h2>
            <p className="mt-1 text-sm text-muted">{selectionHint}</p>
          </div>
          <span className="w-fit rounded-full bg-accent/10 px-3 py-1.5 text-xs font-bold text-accent">{selectedIds.length} of {rows.length} selected</span>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {rows.map((row) => {
            const selected = selectedIds.includes(row.id);
            return (
              <button key={row.id} type="button" onClick={() => toggleBoutique(row.id)} aria-pressed={selected} className={`rounded-2xl border p-4 text-start transition ${selected ? 'border-accent bg-accent/[.07] shadow-sm ring-1 ring-accent/20' : 'border-border bg-surface hover:border-accent/40'}`}>
                <div className="flex items-center justify-between gap-3"><span className="font-bold text-foreground">{row.name}</span><span className={`grid h-6 w-6 place-items-center rounded-full text-xs font-black ${selected ? 'bg-accent text-white' : 'bg-surface-subtle text-muted'}`}>{selected ? '✓' : '+'}</span></div>
                <p className="mt-1 text-xs text-muted">{row.code} · {row.employees} employees</p>
                <p className="mt-3 text-lg font-black tabular-nums text-foreground">{row.achievement.toFixed(1)}%</p>
              </button>
            );
          })}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.55fr_.75fr]">
        <div className="rounded-3xl border border-border bg-surface-elevated p-5 shadow-sm md:p-6">
          <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-accent">Live comparison</p><h2 className="mt-1 text-xl font-bold text-foreground">Selected boutique performance</h2></div><Link href="/executive/compare" className="text-sm font-semibold text-accent">Detailed report →</Link></div>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {ranked.map((row, index) => (
              <article key={row.id} className="rounded-2xl border border-border bg-surface p-4">
                <div className="flex items-start justify-between gap-4"><div><p className="font-bold text-foreground">#{index + 1} {row.name}</p><p className="mt-1 text-xs text-muted">{row.invoices} invoices · {row.pieces} pieces</p></div><p className="text-xl font-black tabular-nums text-foreground">{row.achievement.toFixed(1)}%</p></div>
                <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-surface-subtle"><div className={`h-full rounded-full ${row.achievement >= 100 ? 'bg-emerald-500' : row.achievement >= 80 ? 'bg-cyan-500' : 'bg-amber-500'}`} style={{ width: `${Math.min(100, row.achievement)}%` }} /></div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><p className="text-xs text-muted">Sales</p><p className="mt-1 font-bold tabular-nums">{money.format(row.actual)} SAR</p></div><div><p className="text-xs text-muted">Gap</p><p className="mt-1 font-bold tabular-nums">{money.format(Math.max(0, row.target - row.actual))} SAR</p></div></div>
              </article>
            ))}
          </div>
        </div>
        <aside className="space-y-4">
          <div className="rounded-3xl border border-border bg-surface-elevated p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-[.2em] text-accent">Commercial quality</p><div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-surface-subtle p-4"><p className="text-xs text-muted">AVT</p><p className="mt-1 text-xl font-black">{money.format(totals.avt)} SAR</p></div><div className="rounded-2xl bg-surface-subtle p-4"><p className="text-xs text-muted">UPT</p><p className="mt-1 text-xl font-black">{totals.upt.toFixed(2)}</p></div></div></div>
          <div className="rounded-3xl border border-border bg-surface-elevated p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-[.2em] text-accent">Regional tools</p><div className="mt-3 grid gap-2"><Link href="/area/employees" className="rounded-xl bg-surface-subtle px-4 py-3 text-sm font-semibold">Employees across boutiques</Link><Link href="/area/targets" className="rounded-xl bg-surface-subtle px-4 py-3 text-sm font-semibold">Target control</Link><Link href="/approvals" className="rounded-xl bg-surface-subtle px-4 py-3 text-sm font-semibold">Approvals queue</Link></div></div>
        </aside>
      </section>
    </div>
  );
}
