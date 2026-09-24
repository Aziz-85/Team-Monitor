import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { requireExecutiveApiViewer } from '@/lib/executive/execAccess';

export const dynamic = 'force-dynamic';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

function monthIndex(value: string) {
  return Number(value.slice(0, 4)) * 12 + Number(value.slice(5, 7)) - 1;
}

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const gate = await requireExecutiveApiViewer(request, user);
  if (!gate.ok) return gate.res;

  const from = request.nextUrl.searchParams.get('from') ?? '';
  const to = request.nextUrl.searchParams.get('to') ?? '';
  if (!MONTH.test(from) || !MONTH.test(to) || monthIndex(to) < monthIndex(from)) {
    return NextResponse.json({ error: 'Invalid period' }, { status: 400 });
  }
  if (monthIndex(to) - monthIndex(from) > 23) {
    return NextResponse.json({ error: 'Maximum period is 24 months' }, { status: 400 });
  }

  const boutiqueId = gate.scope.boutiqueId;
  const where = { boutiqueId, month: { gte: from, lte: to } };
  const [monthlyRows, dailyRows, staffRows, employeeTargets, boutiqueTargets, boutique] = await Promise.all([
    prisma.salesEntry.groupBy({ by: ['month'], where, _sum: { amount: true, invoiceCount: true, pieceCount: true } }),
    prisma.salesEntry.groupBy({ by: ['dateKey'], where, _sum: { amount: true, invoiceCount: true, pieceCount: true } }),
    prisma.salesEntry.groupBy({ by: ['userId'], where, _sum: { amount: true, invoiceCount: true, pieceCount: true } }),
    prisma.employeeMonthlyTarget.findMany({ where: { boutiqueId, month: { gte: from, lte: to } }, select: { userId: true, amount: true } }),
    prisma.boutiqueMonthlyTarget.findMany({ where: { boutiqueId, month: { gte: from, lte: to } }, select: { month: true, amount: true } }),
    prisma.boutique.findUnique({ where: { id: boutiqueId }, select: { code: true } }),
  ]);

  const userIds = staffRows.map((row) => row.userId);
  const users = userIds.length ? await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, empId: true, employee: { select: { name: true } } },
  }) : [];
  const userMap = new Map(users.map((row) => [row.id, { empId: row.empId, name: row.employee?.name?.trim() || row.empId }]));
  const targetByUser = new Map<string, number>();
  employeeTargets.forEach((row) => targetByUser.set(row.userId, (targetByUser.get(row.userId) ?? 0) + row.amount));

  const monthMap = new Map(monthlyRows.map((row) => [row.month, row]));
  const targetMap = new Map(boutiqueTargets.map((row) => [row.month, row.amount]));
  const months: string[] = [];
  for (let cursor = monthIndex(from); cursor <= monthIndex(to); cursor += 1) {
    const year = Math.floor(cursor / 12);
    const month = cursor % 12 + 1;
    months.push(`${year}-${String(month).padStart(2, '0')}`);
  }

  return NextResponse.json({
    from,
    to,
    branchCode: boutique?.code ?? '',
    targetHalalas: boutiqueTargets.reduce((sum, row) => sum + row.amount * 100, 0),
    monthly: months.map((month) => {
      const row = monthMap.get(month);
      return {
        month,
        netSalesHalalas: (row?._sum.amount ?? 0) * 100,
        targetHalalas: (targetMap.get(month) ?? 0) * 100,
        invoices: row?._sum.invoiceCount ?? 0,
        pieces: row?._sum.pieceCount ?? 0,
      };
    }),
    daily: dailyRows.map((row) => ({
      date: row.dateKey,
      netSalesHalalas: (row._sum.amount ?? 0) * 100,
      invoices: row._sum.invoiceCount ?? 0,
      pieces: row._sum.pieceCount ?? 0,
    })).sort((a, b) => a.date.localeCompare(b.date)),
    staff: staffRows.map((row) => {
      const target = targetByUser.get(row.userId) ?? 0;
      const sales = row._sum.amount ?? 0;
      const meta = userMap.get(row.userId);
      return {
        empId: meta?.empId,
        name: meta?.name ?? row.userId.slice(0, 8),
        netSalesHalalas: sales * 100,
        targetHalalas: target * 100,
        achievementPct: target > 0 ? sales / target * 100 : null,
        invoices: row._sum.invoiceCount ?? 0,
        pieces: row._sum.pieceCount ?? 0,
      };
    }),
  });
}
