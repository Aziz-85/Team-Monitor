/**
 * GET /api/target/boutique/daily?month=YYYY-MM&date=YYYY-MM-DD
 * Boutique-level daily target: month target, achieved, MTD through selected date, remaining, daily required, today achieved & %.
 * SAR_INT only. Manager/Admin only; uses operational boutique.
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveMetricsScope } from '@/lib/metrics/scope';
import { parseMonthKeyOrThrow, parseIsoDateOrThrow } from '@/lib/time/parse';
import {
  getRiyadhNow,
  toRiyadhDateString,
  getDaysRemainingInMonthIncluding,
  normalizeMonthKey,
} from '@/lib/time';
import { dailyRequiredTargetSar, remainingMonthTargetSar } from '@/lib/targets/requiredPaceTargets';
import { prisma } from '@/lib/db';
import { aggregateSalesEntrySum, salesEntryWhereForBoutiqueMonth } from '@/lib/sales/readSalesAggregate';

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

  const bid = scope.effectiveBoutiqueId;

  const riyadhToday = toRiyadhDateString(getRiyadhNow());

  const [boutiqueTarget, monthAchievedSar, mtdThroughDateSar, todayAchievedSar, entryCountForDate] =
    await Promise.all([
    prisma.boutiqueMonthlyTarget.findFirst({
      where: { boutiqueId: bid, month: normMonth },
      select: { amount: true },
    }),
    aggregateSalesEntrySum(salesEntryWhereForBoutiqueMonth(bid, normMonth)),
    aggregateSalesEntrySum({
      boutiqueId: bid,
      month: normMonth,
      dateKey: { lte: dateStr },
    }),
    aggregateSalesEntrySum({
      boutiqueId: bid,
      dateKey: dateStr,
    }),
    dateStr === riyadhToday
      ? prisma.salesEntry.count({ where: { boutiqueId: bid, dateKey: dateStr } })
      : Promise.resolve(1),
  ]);

  const monthTargetSar = boutiqueTarget?.amount ?? 0;
  const remainingSar = remainingMonthTargetSar(monthTargetSar, monthAchievedSar);
  const dailyRequiredSar = dailyRequiredTargetSar(remainingSar, daysRemaining);
  const dailyProgressPending = dateStr === riyadhToday && entryCountForDate === 0;
  const todayPct = dailyProgressPending
    ? null
    : dailyRequiredSar > 0
      ? Math.floor((todayAchievedSar * 100) / dailyRequiredSar)
      : 0;

  return NextResponse.json({
    boutiqueId: scope.effectiveBoutiqueId,
    month: normMonth,
    date: dateStr,
    monthTargetSar,
    monthAchievedSar,
    /** MTD through selected `date` (inclusive), same month — for summaries / copy vs full `monthAchievedSar`. */
    mtdThroughDateSar,
    remainingSar,
    daysRemaining,
    dailyRequiredSar,
    todayAchievedSar,
    todayPct,
    dailyProgressPending,
  });
}
