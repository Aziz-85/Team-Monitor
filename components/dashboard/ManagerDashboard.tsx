import Link from 'next/link';
import { prisma } from '@/lib/db';
import { getCurrentMonthKeyRiyadh } from '@/lib/time';
import { getDefaultDashboardDate, getManagerDashboard } from '@/lib/dashboard/managerDashboard';

const money = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export async function ManagerDashboard({ boutiqueId, boutiqueName }: { boutiqueId: string; boutiqueName: string }) {
  const month = getCurrentMonthKeyRiyadh();
  const date = getDefaultDashboardDate();
  const [daily, targetRow, monthSales, teamUsers, teamSales, teamTargets, pendingLeaves] = await Promise.all([
    getManagerDashboard(boutiqueId, date),
    prisma.boutiqueMonthlyTarget.findUnique({ where: { boutiqueId_month: { boutiqueId, month } }, select: { amount: true } }),
    prisma.salesEntry.aggregate({ where: { boutiqueId, month }, _sum: { amount: true, invoiceCount: true, pieceCount: true } }),
    prisma.user.findMany({ where: { boutiqueId, disabled: false, employee: { active: true, isSystemOnly: false } }, select: { id: true, employee: { select: { name: true, empId: true } } } }),
    prisma.salesEntry.groupBy({ by: ['userId'], where: { boutiqueId, month }, _sum: { amount: true, invoiceCount: true, pieceCount: true } }),
    prisma.employeeMonthlyTarget.findMany({ where: { boutiqueId, month }, select: { userId: true, amount: true } }),
    prisma.leaveRequest.count({ where: { boutiqueId, status: 'SUBMITTED' } }),
  ]);
  const target = targetRow?.amount ?? 0;
  const sales = monthSales._sum.amount ?? 0;
  const invoices = monthSales._sum.invoiceCount ?? 0;
  const pieces = monthSales._sum.pieceCount ?? 0;
  const achievement = target > 0 ? (sales / target) * 100 : 0;
  const salesMap = new Map(teamSales.map((row) => [row.userId, row._sum]));
  const targetMap = new Map(teamTargets.map((row) => [row.userId, row.amount]));
  const team = teamUsers.map((member) => {
    const actual = salesMap.get(member.id)?.amount ?? 0;
    const personalTarget = targetMap.get(member.id) ?? 0;
    return { id: member.id, name: member.employee?.name ?? member.employee?.empId ?? 'Employee', actual, target: personalTarget, achievement: personalTarget > 0 ? (actual / personalTarget) * 100 : 0 };
  }).sort((a, b) => b.actual - a.actual);

  return (
    <div className="mx-auto max-w-[1540px] space-y-6 p-4 md:p-7">
      <section className="relative overflow-hidden rounded-[32px] bg-[linear-gradient(122deg,#102d52_0%,#13506a_60%,#0f756e_125%)] p-6 text-white shadow-[0_30px_80px_-42px_rgba(6,29,58,.95)] md:p-8">
        <div className="pointer-events-none absolute -end-20 -top-28 h-80 w-80 rounded-full border border-white/10 bg-white/[.04]" />
        <div className="relative flex flex-wrap items-end justify-between gap-5"><div><p className="text-xs font-bold uppercase tracking-[.24em] text-cyan-200">Boutique command center · {month}</p><h1 className="mt-3 text-3xl font-black md:text-4xl">{boutiqueName}</h1><p className="mt-2 max-w-2xl text-sm text-white/70">A focused view of sales, team execution, target pace, and actions requiring your attention.</p></div><div className="flex gap-2"><Link href="/notifications" className="rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-bold">Notifications</Link><Link href="/sales/summary" className="rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-900">Sales workspace</Link></div></div>
        <div className="relative mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            ['Month sales', `${money.format(sales)} SAR`], ['Boutique target', `${money.format(target)} SAR`], ['Achievement', `${achievement.toFixed(1)}%`], ['Remaining', `${money.format(Math.max(0, target - sales))} SAR`], ['Pending leaves', String(pendingLeaves)],
          ].map(([label, value]) => <div key={label} className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur"><p className="text-[11px] font-bold uppercase tracking-wider text-white/60">{label}</p><p className="mt-2 text-2xl font-black tabular-nums">{value}</p></div>)}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-4">
        <article className="rounded-3xl border border-border bg-surface-elevated p-5 shadow-sm lg:col-span-2"><div className="flex items-center justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-accent">Monthly pace</p><h2 className="mt-1 text-xl font-bold">Target progress</h2></div><p className="text-3xl font-black tabular-nums">{achievement.toFixed(1)}%</p></div><div className="mt-5 h-3 overflow-hidden rounded-full bg-surface-subtle"><div className={`h-full rounded-full ${achievement >= 100 ? 'bg-emerald-500' : achievement >= 80 ? 'bg-cyan-500' : 'bg-amber-500'}`} style={{ width: `${Math.min(100, achievement)}%` }} /></div><div className="mt-5 grid grid-cols-3 gap-3"><div><p className="text-xs text-muted">Invoices</p><p className="mt-1 text-xl font-black">{invoices}</p></div><div><p className="text-xs text-muted">Pieces</p><p className="mt-1 text-xl font-black">{pieces}</p></div><div><p className="text-xs text-muted">UPT</p><p className="mt-1 text-xl font-black">{invoices > 0 ? (pieces / invoices).toFixed(2) : '—'}</p></div></div></article>
        <article className="rounded-3xl border border-border bg-surface-elevated p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-[.18em] text-accent">Today</p><h2 className="mt-1 text-xl font-bold">Sales pulse</h2><p className="mt-5 text-3xl font-black tabular-nums">{money.format(daily.sales.achieved)} SAR</p><p className="mt-1 text-sm text-muted">Required pace {money.format(daily.sales.target)} SAR</p><div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-subtle"><div className="h-full rounded-full bg-sky-500" style={{ width: `${Math.min(100, daily.sales.percent)}%` }} /></div></article>
        <article className="rounded-3xl border border-border bg-surface-elevated p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-[.18em] text-accent">Execution</p><h2 className="mt-1 text-xl font-bold">Today’s operation</h2><div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-surface-subtle p-3"><p className="text-xs text-muted">Tasks</p><p className="mt-1 text-xl font-black">{daily.tasks.done}/{daily.tasks.total}</p></div><div className="rounded-2xl bg-surface-subtle p-3"><p className="text-xs text-muted">Coverage</p><p className={`mt-1 text-xl font-black ${daily.coverage.isOk ? 'text-emerald-600' : 'text-amber-600'}`}>{daily.coverage.isOk ? 'Ready' : 'Review'}</p></div></div><p className="mt-4 text-xs text-muted">AM {daily.coverage.am} · PM {daily.coverage.pm}</p></article>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.45fr_.65fr]">
        <div className="rounded-3xl border border-border bg-surface-elevated p-5 shadow-sm md:p-6"><div className="flex items-end justify-between"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-accent">Team performance</p><h2 className="mt-1 text-xl font-bold">Monthly leaderboard</h2></div><Link href="/performance" className="text-sm font-semibold text-accent">Full analysis →</Link></div><div className="mt-5 grid gap-3 md:grid-cols-2">{team.map((member, index) => <article key={member.id} className="rounded-2xl border border-border bg-surface p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-bold">#{index + 1} {member.name}</p><p className="mt-1 text-xs text-muted">{money.format(member.actual)} / {money.format(member.target)} SAR</p></div><p className="text-lg font-black">{member.achievement.toFixed(1)}%</p></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-subtle"><div className="h-full rounded-full bg-gradient-to-r from-violet-600 to-cyan-500" style={{ width: `${Math.min(100, member.achievement)}%` }} /></div></article>)}</div></div>
        <aside className="rounded-3xl border border-border bg-surface-elevated p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-[.18em] text-accent">Manager actions</p><div className="mt-4 grid gap-2"><Link href="/schedule/edit" className="rounded-xl bg-surface-subtle px-4 py-3 text-sm font-semibold">Manage schedule</Link><Link href="/tasks/monitor" className="rounded-xl bg-surface-subtle px-4 py-3 text-sm font-semibold">Monitor tasks</Link><Link href="/approvals" className="rounded-xl bg-surface-subtle px-4 py-3 text-sm font-semibold">Review approvals</Link><Link href="/sales/summary" className="rounded-xl bg-surface-subtle px-4 py-3 text-sm font-semibold">Sales summary</Link></div></aside>
      </section>
    </div>
  );
}
