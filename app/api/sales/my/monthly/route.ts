/**
 * GET /api/sales/my/monthly?fromMonth=YYYY-MM&toMonth=YYYY-MM
 * Employee monthly summary: target, achieved, remaining, pct per month + quarter aggregates.
 * SAR_INT only. Uses EmployeeMonthlyTarget.amount and SalesEntry.amount (both SAR).
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveMetricsScope } from '@/lib/metrics/scope';
import { parseMonthKeyOrThrow } from '@/lib/time/parse';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

function monthKeysBetween(fromMonth: string, toMonth: string): string[] {
  const [y1, m1] = fromMonth.split('-').map(Number);
  const [y2, m2] = toMonth.split('-').map(Number);
  const keys: string[] = [];
  for (let y = y1; y <= y2; y++) {
    const startM = y === y1 ? m1 : 1;
    const endM = y === y2 ? m2 : 12;
    for (let m = startM; m <= endM; m++) {
      keys.push(`${y}-${String(m).padStart(2, '0')}`);
    }
  }
  return keys;
}

function quarterFromMonth(monthKey: string): string {
  const [, mStr] = monthKey.split('-');
  const m = Number(mStr);
  const q = Math.ceil(m / 3);
  const y = monthKey.slice(0, 4);
  return `${y}-Q${q}`;
}

export async function GET(request: NextRequest) {
  const scope = await resolveMetricsScope(request);
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!scope.effectiveBoutiqueId) {
    return NextResponse.json({ error: 'No boutique scope for metrics' }, { status: 403 });
  }
  if (!scope.employeeOnly) {
    return NextResponse.json({ error: 'Monthly summary is for employee scope only' }, { status: 403 });
  }

  const fromParam = request.nextUrl.searchParams.get('fromMonth')?.trim();
  const toParam = request.nextUrl.searchParams.get('toMonth')?.trim();
  if (!fromParam || !toParam) {
    return NextResponse.json({ error: 'fromMonth and toMonth are required (YYYY-MM)' }, { status: 400 });
  }

  let fromMonth: string;
  let toMonth: string;
  try {
    fromMonth = parseMonthKeyOrThrow(fromParam);
    toMonth = parseMonthKeyOrThrow(toParam);
  } catch {
    return NextResponse.json({ error: 'fromMonth and toMonth must be YYYY-MM' }, { status: 400 });
  }
  if (fromMonth > toMonth) [fromMonth, toMonth] = [toMonth, fromMonth];

  const monthKeys = monthKeysBetween(fromMonth, toMonth);

  const [targets, salesByMonth] = await Promise.all([
    prisma.employeeMonthlyTarget.findMany({
      where: {
        boutiqueId: scope.effectiveBoutiqueId,
        userId: scope.userId,
        month: { in: monthKeys },
      },
      select: { month: true, amount: true },
    }),
    prisma.salesEntry.groupBy({
      by: ['month'],
      where: {
        boutiqueId: scope.effectiveBoutiqueId,
        userId: scope.userId,
        month: { in: monthKeys },
        source: { in: ['LEDGER', 'IMPORT', 'MANUAL'] },
      },
      _sum: { amount: true },
    }),
  ]);

  const targetByMonth = new Map(targets.map((t) => [t.month, t.amount]));
  const achievedByMonth = new Map(salesByMonth.map((r) => [r.month, r._sum.amount ?? 0]));

  const months = monthKeys.map((month) => {
    const targetSar = targetByMonth.get(month) ?? 0;
    const achievedSar = achievedByMonth.get(month) ?? 0;
    const remainingSar = Math.max(targetSar - achievedSar, 0);
    const pct = targetSar > 0 ? Math.floor((achievedSar * 100) / targetSar) : 0;
    return {
      month,
      targetSar,
      achievedSar,
      remainingSar,
      pct,
    };
  });

  const quarterMap = new Map<
    string,
    { targetSar: number; achievedSar: number; remainingSar: number }
  >();
  for (const row of months) {
    const q = quarterFromMonth(row.month);
    const cur = quarterMap.get(q) ?? { targetSar: 0, achievedSar: 0, remainingSar: 0 };
    cur.targetSar += row.targetSar;
    cur.achievedSar += row.achievedSar;
    cur.remainingSar += row.remainingSar;
    quarterMap.set(q, cur);
  }
  const quarters = Array.from(quarterMap.entries())
    .map(([quarter, data]) => ({
      quarter,
      targetSar: data.targetSar,
      achievedSar: data.achievedSar,
      remainingSar: data.remainingSar,
    }))
    .sort((a, b) => a.quarter.localeCompare(b.quarter));

  return NextResponse.json({ months, quarters });
}
