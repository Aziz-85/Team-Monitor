import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getUserAllowedBoutiqueIds } from '@/lib/scope/resolveScope';
import { getCurrentMonthKeyRiyadh } from '@/lib/time';
import { getServerTranslations } from '@/lib/i18n/serverTranslate';

const money = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export default async function AreaOverviewPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role !== 'AREA_MANAGER' && user.role !== 'SUPER_ADMIN') redirect('/');
  const boutiqueIds = user.role === 'SUPER_ADMIN'
    ? (await prisma.boutique.findMany({ where: { isActive: true }, select: { id: true } })).map((b) => b.id)
    : await getUserAllowedBoutiqueIds(user.id);
  const month = getCurrentMonthKeyRiyadh();
  const t = await getServerTranslations('areaDashboard');
  const [boutiques, targets, sales, pendingLeaves, employeeGroups] = await Promise.all([
    prisma.boutique.findMany({ where: { id: { in: boutiqueIds }, isActive: true }, select: { id: true, code: true, name: true }, orderBy: { code: 'asc' } }),
    prisma.boutiqueMonthlyTarget.findMany({ where: { boutiqueId: { in: boutiqueIds }, month }, select: { boutiqueId: true, amount: true } }),
    prisma.salesEntry.groupBy({ by: ['boutiqueId'], where: { boutiqueId: { in: boutiqueIds }, month }, _sum: { amount: true, invoiceCount: true, pieceCount: true } }),
    prisma.leaveRequest.count({ where: { boutiqueId: { in: boutiqueIds }, status: 'SUBMITTED' } }),
    prisma.employee.groupBy({ by: ['boutiqueId'], where: { boutiqueId: { in: boutiqueIds }, active: true, isSystemOnly: false }, _count: { _all: true } }),
  ]);
  const targetMap = new Map(targets.map((row) => [row.boutiqueId, row.amount]));
  const salesMap = new Map(sales.map((row) => [row.boutiqueId, row._sum]));
  const employeeMap = new Map(employeeGroups.map((row) => [row.boutiqueId, row._count._all]));
  const rows = boutiques.map((boutique) => {
    const target = targetMap.get(boutique.id) ?? 0;
    const actual = salesMap.get(boutique.id)?.amount ?? 0;
    return { ...boutique, target, actual, achievement: target > 0 ? (actual / target) * 100 : 0, employees: employeeMap.get(boutique.id) ?? 0, invoices: salesMap.get(boutique.id)?.invoiceCount ?? 0, pieces: salesMap.get(boutique.id)?.pieceCount ?? 0 };
  }).sort((a, b) => b.achievement - a.achievement);
  const totalTarget = rows.reduce((sum, row) => sum + row.target, 0);
  const totalSales = rows.reduce((sum, row) => sum + row.actual, 0);
  const achievement = totalTarget > 0 ? (totalSales / totalTarget) * 100 : 0;

  return <div className="mx-auto max-w-[1500px] space-y-6 p-4 md:p-7">
    <section className="overflow-hidden rounded-[30px] bg-[linear-gradient(120deg,#102f56,#155c68)] p-6 text-white shadow-xl md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-5"><div><p className="text-xs font-bold uppercase tracking-[.24em] text-cyan-200">{t('eyebrow')} · {month}</p><h1 className="mt-3 text-3xl font-bold md:text-4xl">{t('title')}</h1><p className="mt-2 max-w-2xl text-sm text-white/70">{t('subtitle')}</p></div><Link href="/notifications" className="rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-900">{t('openNotifications')}</Link></div>
      <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[[t('areaSales'), `${money.format(totalSales)} SAR`], [t('areaTarget'), `${money.format(totalTarget)} SAR`], [t('achievement'), `${achievement.toFixed(1)}%`], [t('remaining'), `${money.format(Math.max(0, totalTarget - totalSales))} SAR`], [t('pendingLeaves'), String(pendingLeaves)]].map(([label, value]) => <div key={label} className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur"><p className="text-xs uppercase tracking-wider text-white/60">{label}</p><p className="mt-2 text-2xl font-bold">{value}</p></div>)}
      </div>
    </section>
    <section className="grid gap-4 lg:grid-cols-[1.6fr_.8fr]">
      <div className="rounded-3xl border border-border bg-surface-elevated p-5 shadow-sm"><div className="mb-5 flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-accent">{t('ranking')}</p><h2 className="mt-1 text-xl font-bold text-foreground">{t('performanceByBoutique')}</h2></div><Link href="/executive/compare" className="text-sm font-semibold text-accent">{t('detailedComparison')} →</Link></div><div className="space-y-3">{rows.map((row, index) => <div key={row.id} className="rounded-2xl border border-border p-4"><div className="flex items-center justify-between gap-4"><div><p className="font-semibold text-foreground">#{index + 1} {row.name} <span className="text-xs font-normal text-muted">({row.code})</span></p><p className="mt-1 text-xs text-muted">{row.employees} {t('employees')} · {row.invoices} {t('invoices')} · {row.pieces} {t('pieces')}</p></div><div className="text-end"><p className="text-lg font-bold text-foreground">{row.achievement.toFixed(1)}%</p><p className="text-xs text-muted">{money.format(row.actual)} / {money.format(row.target)} SAR</p></div></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-subtle"><div className={`h-full rounded-full ${row.achievement >= 100 ? 'bg-emerald-500' : row.achievement >= 80 ? 'bg-cyan-500' : 'bg-amber-500'}`} style={{ width: `${Math.min(100, row.achievement)}%` }} /></div></div>)}</div></div>
      <aside className="space-y-4"><div className="rounded-3xl border border-border bg-surface-elevated p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-[.2em] text-accent">{t('actionQueue')}</p><h2 className="mt-1 text-xl font-bold text-foreground">{t('needsAttention')}</h2><Link href="/leaves" className="mt-5 flex items-center justify-between rounded-2xl bg-amber-500/10 p-4"><span className="text-sm font-semibold text-foreground">{t('pendingLeaveRequests')}</span><span className="text-2xl font-bold text-amber-600">{pendingLeaves}</span></Link><Link href="/approvals" className="mt-3 block rounded-2xl border border-border p-4 text-sm font-semibold text-foreground">{t('openApprovals')} →</Link></div><div className="rounded-3xl border border-border bg-surface-elevated p-5 shadow-sm"><p className="font-semibold text-foreground">{t('regionalTools')}</p><div className="mt-3 grid gap-2"><Link href="/area/employees" className="rounded-xl bg-surface-subtle px-4 py-3 text-sm font-medium">{t('employeesAcross')}</Link><Link href="/area/targets" className="rounded-xl bg-surface-subtle px-4 py-3 text-sm font-medium">{t('targetControl')}</Link><Link href="/performance" className="rounded-xl bg-surface-subtle px-4 py-3 text-sm font-medium">{t('performanceIntelligence')}</Link></div></div></aside>
    </section>
  </div>;
}
