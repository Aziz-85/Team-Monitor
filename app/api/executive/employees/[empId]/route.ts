/**
 * GET /api/executive/employees/[empId]?year=YYYY&global=true — One employee annual. ADMIN + MANAGER only.
 * Source of truth: SalesEntry (LEDGER, IMPORT, MANUAL). global=true: ADMIN only, all boutiques + audit.
 * MANAGER: always scope. SAR integer only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { resolveExecutiveBoutiqueIds } from '@/lib/executive/scope';
import type { Role } from '@prisma/client';

function variance(arr: number[]): number {
  if (arr.length === 0) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const sq = arr.map((x) => (x - mean) ** 2);
  return sq.reduce((a, b) => a + b, 0) / arr.length;
}

const SALES_ENTRY_SOURCES_ALL = ['LEDGER', 'IMPORT', 'MANUAL'];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ empId: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const role = user.role as Role;
  if (role !== 'MANAGER' && role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const globalParam = request.nextUrl.searchParams.get('global');
  const { boutiqueIds } = await resolveExecutiveBoutiqueIds(user.id, role, globalParam, 'EXECUTIVE_EMPLOYEES');
  if (boutiqueIds.length === 0) {
    return NextResponse.json({ error: 'No boutiques in scope' }, { status: 403 });
  }

  const { empId } = await params;
  const yearParam = request.nextUrl.searchParams.get('year');
  const year = yearParam && /^\d{4}$/.test(yearParam) ? yearParam : String(new Date().getFullYear());

  const employee = await prisma.employee.findUnique({
    where: { empId },
    select: { empId: true, name: true },
  });
  if (!employee) {
    return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
  }

  const monthPrefix = `${year}-`;

  const entries = await prisma.salesEntry.findMany({
    where: {
      boutiqueId: { in: boutiqueIds },
      month: { startsWith: monthPrefix },
      source: { in: SALES_ENTRY_SOURCES_ALL },
      user: { empId },
    },
    select: {
      amount: true,
      month: true,
      boutiqueId: true,
    },
  });

  let total = 0;
  const byBoutique = new Map<string, { code: string; name: string; total: number }>();
  const byMonth = new Map<string, number>();

  for (const e of entries) {
    total += e.amount;
    const bid = e.boutiqueId;
    const monthKey = e.month;
    if (bid) {
      let b = byBoutique.get(bid);
      if (!b) {
        b = { code: bid, name: bid, total: 0 };
        byBoutique.set(bid, b);
      }
      b.total += e.amount;
    }
    byMonth.set(monthKey, (byMonth.get(monthKey) ?? 0) + e.amount);
  }

  const monthlySeries = Array.from({ length: 12 }, (_, i) => {
    const m = String(i + 1).padStart(2, '0');
    return byMonth.get(`${year}-${m}`) ?? 0;
  });
  const consistencyScore = monthlySeries.filter((x) => x > 0).length <= 1
    ? 100
    : Math.max(0, 100 - Math.round(Math.sqrt(variance(monthlySeries))));
  const monthAmounts = monthlySeries.map((amount, i) => ({ month: `${year}-${String(i + 1).padStart(2, '0')}`, amount }));
  const sorted = [...monthAmounts].sort((a, b) => b.amount - a.amount);
  const topMonths = sorted.slice(0, 3);
  const bottomMonths = sorted.filter((m) => m.amount > 0).slice(-3).reverse();

  const byBoutiqueArr = Array.from(byBoutique.entries()).map(([boutiqueId, v]) => ({
    boutiqueId,
    boutiqueCode: v.code,
    boutiqueName: v.name,
    total: v.total,
  }));

  let achievementPct: number | null = null;
  const empUser = await prisma.user.findUnique({
    where: { empId },
    select: { id: true },
  });
  if (empUser) {
    const monthKeys = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
    const targets = await prisma.employeeMonthlyTarget.findMany({
      where: { userId: empUser.id, month: { in: monthKeys } },
      select: { amount: true },
    });
    const annualTarget = targets.reduce((s, t) => s + t.amount, 0);
    if (annualTarget > 0) achievementPct = Math.round((total / annualTarget) * 100);
  }

  return NextResponse.json({
    year,
    empId: employee.empId,
    name: employee.name ?? employee.empId,
    annualTotal: total,
    byBoutique: byBoutiqueArr,
    monthlySeries,
    consistencyScore,
    topMonths,
    bottomMonths,
    achievementPct,
  });
}
