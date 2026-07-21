/**
 * GET /api/target/boutique/daily?month=YYYY-MM&date=YYYY-MM-DD
 * Boutique-level daily target from imported BoutiqueMonthlyTarget.
 */

import { NextRequest, NextResponse } from 'next/server';
import type { Role } from '@prisma/client';
import { resolveMetricsScope } from '@/lib/metrics/scope';
import { parseMonthKeyOrThrow, parseIsoDateOrThrow } from '@/lib/time/parse';
import {
  getRiyadhNow,
  toRiyadhDateString,
  getDaysRemainingInMonthIncluding,
  normalizeMonthKey,
  getDaysInMonth,
} from '@/lib/time';
import { dailyRequiredTargetSar, remainingMonthTargetSar } from '@/lib/targets/requiredPaceTargets';
import { getDailyTargetForDay } from '@/lib/targets/dailyTarget';
import { lookupBoutiqueMonthlyTarget } from '@/lib/targets/boutiqueMonthlyTargetLookup';
import { prisma } from '@/lib/db';
import { aggregateSalesEntrySum, salesEntryWhereForBoutiqueMonth } from '@/lib/sales/readSalesAggregate';
import { calculatePerformance } from '@/lib/performance/performanceEngine';

export const dynamic = 'force-dynamic';

const BOUTIQUE_DAILY_ROLES: Role[] = [
  'MANAGER',
  'ASSISTANT_MANAGER',
  'ADMIN',
  'SUPER_ADMIN',
  'AREA_MANAGER',
];

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
  const dayOfMonth = new Date(dateStr + 'T00:00:00.000Z').getUTCDate();
  const daysInMonth = getDaysInMonth(normMonth);

  const [targetLookup, monthAchievedSar, mtdThroughDateSar, todayAchievedSar, entryCountForDate] =
    await Promise.all([
      lookupBoutiqueMonthlyTarget({
        boutiqueId: bid,
        monthKey: normMonth,
        routeName: '/api/target/boutique/daily',
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

  const hasMonthlyTarget = targetLookup.hasTarget;
  const monthTargetSar = hasMonthlyTarget ? targetLookup.amount! : null;
  const dailyTargetSar =
    hasMonthlyTarget && monthTargetSar != null
      ? getDailyTargetForDay(monthTargetSar, daysInMonth, dayOfMonth)
      : null;

  const remainingSar =
    hasMonthlyTarget && monthTargetSar != null
      ? remainingMonthTargetSar(monthTargetSar, mtdThroughDateSar)
      : 0;
  const dailyRequiredSar =
    hasMonthlyTarget && monthTargetSar != null
      ? dailyRequiredTargetSar(remainingSar, daysRemaining)
      : 0;

  const dailyProgressPending = dateStr === riyadhToday && entryCountForDate === 0;
  const todayPct = !hasMonthlyTarget
    ? null
    : dailyProgressPending
      ? null
      : dailyRequiredSar > 0
        ? Math.floor((todayAchievedSar * 100) / dailyRequiredSar)
        : monthTargetSar === 0
          ? 0
          : null;

  const mtdAchievementPct =
    hasMonthlyTarget && monthTargetSar != null
      ? calculatePerformance({ target: monthTargetSar, sales: mtdThroughDateSar }).percent
      : null;

  return NextResponse.json({
    boutiqueId: scope.effectiveBoutiqueId,
    month: normMonth,
    date: dateStr,
    hasMonthlyTarget,
    monthTargetSar,
    /** Static calendar allocation of month target (reporting only). */
    dailyTargetSar,
    /** Alias: dynamic daily target from remaining monthly goal ÷ remaining days. */
    dynamicDailyTargetSar: dailyRequiredSar,
    monthAchievedSar,
    mtdThroughDateSar,
    remainingSar,
    daysRemaining,
    dailyRequiredSar,
    todayAchievedSar,
    todayPct,
    mtdAchievementPct,
    dailyProgressPending,
  });
}
