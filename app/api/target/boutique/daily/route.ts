/**
 * GET /api/target/boutique/daily?month=YYYY-MM&date=YYYY-MM-DD
 * Boutique-level daily target: month target, achieved, remaining, daily required, today achieved & %.
 * SAR_INT only. Manager/Admin only; uses operational boutique.
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveMetricsScope } from '@/lib/metrics/scope';
import { parseMonthKeyOrThrow, parseIsoDateOrThrow } from '@/lib/time/parse';
import { toRiyadhDateString, getDaysRemainingInMonthIncluding, normalizeMonthKey } from '@/lib/time';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

const BOUTIQUE_DAILY_ROLES = ['MANAGER', 'ADMIN', 'SUPER_ADMIN'];

export async function GET(request: NextRequest) {
  const scope = await resolveMetricsScope(request);
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!scope.effectiveBoutiqueId) {
    return NextResponse.json({ error: 'No boutique scope' }, { status: 403 });
  }
  if (!BOUTIQUE_DAILY_ROLES.includes(scope.role)) {
    return NextResponse.json({ error: 'Boutique daily target is for manager or admin' }, { status: 403 });
  }

  const monthParam = request.nextUrl.searchParams.get('month')?.trim();
  const dateParam = request.nextUrl.searchParams.get('date')?.trim();
  if (!monthParam || !dateParam) {
    return NextResponse.json({ error: 'month (YYYY-MM) and date (YYYY-MM-DD) are required' }, { status: 400 });
  }

  let monthKey: string;
  let dateStr: string;
  try {
    monthKey = parseMonthKeyOrThrow(monthParam);
    const date = parseIsoDateOrThrow(dateParam);
    dateStr = toRiyadhDateString(date);
  } catch {
    return NextResponse.json({ error: 'Invalid month or date format' }, { status: 400 });
  }

  const normMonth = normalizeMonthKey(monthKey);
  const daysRemaining = getDaysRemainingInMonthIncluding(normMonth, dateStr);

  const [boutiqueTarget, monthSales, todaySales] = await Promise.all([
    prisma.boutiqueMonthlyTarget.findFirst({
      where: { boutiqueId: scope.effectiveBoutiqueId, month: normMonth },
      select: { amount: true },
    }),
    prisma.salesEntry.aggregate({
      where: {
        boutiqueId: scope.effectiveBoutiqueId,
        month: normMonth,
        source: { in: ['LEDGER', 'IMPORT', 'MANUAL'] },
      },
      _sum: { amount: true },
    }),
    prisma.salesEntry.aggregate({
      where: {
        boutiqueId: scope.effectiveBoutiqueId,
        dateKey: dateStr,
        source: { in: ['LEDGER', 'IMPORT', 'MANUAL'] },
      },
      _sum: { amount: true },
    }),
  ]);

  const monthTargetSar = boutiqueTarget?.amount ?? 0;
  const monthAchievedSar = monthSales._sum.amount ?? 0;
  const remainingSar = Math.max(monthTargetSar - monthAchievedSar, 0);
  const dailyRequiredSar =
    daysRemaining > 0 ? Math.ceil(remainingSar / daysRemaining) : remainingSar;
  const todayAchievedSar = todaySales._sum.amount ?? 0;
  const todayPct =
    dailyRequiredSar > 0 ? Math.floor((todayAchievedSar * 100) / dailyRequiredSar) : 0;

  return NextResponse.json({
    boutiqueId: scope.effectiveBoutiqueId,
    month: normMonth,
    date: dateStr,
    monthTargetSar,
    monthAchievedSar,
    remainingSar,
    daysRemaining,
    dailyRequiredSar,
    todayAchievedSar,
    todayPct,
  });
}
