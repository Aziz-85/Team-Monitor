/**
 * GET /api/target/my/daily?month=YYYY-MM&date=YYYY-MM-DD
 * Dynamic daily target (Mode A): remainingSar, daysRemaining, dailyRequiredSar.
 * SAR_INT only. Asia/Riyadh. Days remaining = from date to end of month INCLUDING date.
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveMetricsScope } from '@/lib/metrics/scope';
import { parseMonthKeyOrThrow, parseIsoDateOrThrow } from '@/lib/time/parse';
import { toRiyadhDateString, getDaysRemainingInMonthIncluding, normalizeMonthKey } from '@/lib/time';
import { dailyRequiredTargetSar, remainingMonthTargetSar } from '@/lib/targets/requiredPaceTargets';
import { prisma } from '@/lib/db';
import { aggregateSalesEntrySum, salesEntryWhereForUserMonth } from '@/lib/sales/readSalesAggregate';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const scope = await resolveMetricsScope(request);
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!scope.effectiveBoutiqueId) {
    return NextResponse.json({ error: 'No boutique scope for metrics' }, { status: 403 });
  }
  if (!scope.employeeOnly) {
    return NextResponse.json({ error: 'My daily target is for employee scope only' }, { status: 403 });
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

  const [targetRows, achievedToDateSar] = await Promise.all([
    prisma.employeeMonthlyTarget.findMany({
      where: {
        userId: scope.userId,
        month: normMonth,
      },
      select: { amount: true },
    }),
    aggregateSalesEntrySum({
      ...salesEntryWhereForUserMonth(scope.userId, normMonth, null),
      dateKey: { lte: dateStr },
    }),
  ]);

  const monthTargetSar = targetRows.reduce((s, r) => s + r.amount, 0);
  const remainingSar = remainingMonthTargetSar(monthTargetSar, achievedToDateSar);
  const dailyRequiredSar = dailyRequiredTargetSar(remainingSar, daysRemaining);

  return NextResponse.json({
    month: normMonth,
    date: dateStr,
    monthTargetSar,
    achievedToDateSar,
    remainingSar,
    daysRemaining,
    dailyRequiredSar,
  });
}
