import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getUserAllowedBoutiqueIds } from '@/lib/scope/resolveScope';
import { getCurrentMonthKeyRiyadh } from '@/lib/time';
import { AreaDashboardClient } from './AreaDashboardClient';

export default async function AreaOverviewPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role !== 'AREA_MANAGER' && user.role !== 'SUPER_ADMIN') redirect('/');
  const boutiqueIds = user.role === 'SUPER_ADMIN'
    ? (await prisma.boutique.findMany({ where: { isActive: true }, select: { id: true } })).map((b) => b.id)
    : await getUserAllowedBoutiqueIds(user.id);
  const month = getCurrentMonthKeyRiyadh();
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
  return <AreaDashboardClient month={month} rows={rows} pendingLeaves={pendingLeaves} />;
}
