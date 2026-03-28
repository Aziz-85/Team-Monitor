/**
 * Boutique daily metrics from SalesEntry + monthly targets (Asia/Riyadh).
 * Operational daily target: ceil(remainingMonth / daysRemainingIncludingSelectedDay).
 * MTD achieved uses last recorded posting day ≤ selected date (not blind calendar today).
 */

import type { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db';
import {
  formatDateRiyadh,
  getDaysInMonth,
  getDaysRemainingInMonthIncluding,
  normalizeDateOnlyRiyadh,
  normalizeMonthKey,
} from '@/lib/time';
import { getDailyTargetForDay } from '@/lib/targets/dailyTarget';

export type DailyMetricsResult = {
  boutiqueId: string;
  monthKey: string;
  dateKey: string;
  monthTargetSar: number;
  lastRecordedDateKey: string | null;
  achievedMtdSar: number;
  remainingMonthTargetSar: number;
  daysRemainingIncludingToday: number;
  dailyTargetSar: number;
  dailyAchievedSar: number;
  dailyRemainingSar: number;
  dailyExceededSar: number;
  dailyAchievementPercent: number;
};

/**
 * Latest calendar day in `monthKey` with positive boutique SalesEntry total, capped at `capDateKey`.
 */
export async function findLastRecordedDateKey(
  db: PrismaClient,
  boutiqueId: string,
  monthKey: string,
  capDateKey: string
): Promise<string | null> {
  const mk = normalizeMonthKey(monthKey);
  const monthFirst = `${mk}-01`;
  const rows = await db.salesEntry.groupBy({
    by: ['dateKey'],
    where: {
      boutiqueId,
      month: mk,
      dateKey: { gte: monthFirst, lte: capDateKey },
    },
    _sum: { amount: true },
  });
  let best: string | null = null;
  for (const r of rows) {
    if ((r._sum.amount ?? 0) <= 0) continue;
    if (!best || r.dateKey > best) best = r.dateKey;
  }
  return best;
}

function dayOfMonthFromDateKey(dateKey: string): number {
  const p = dateKey.split('-');
  return Math.max(1, parseInt(p[2] ?? '1', 10) || 1);
}

/**
 * `date` is interpreted as a Riyadh calendar day (YYYY-MM-DD or Date).
 */
export async function getDailyMetrics(
  boutiqueId: string,
  date: string | Date,
  db: PrismaClient = prisma
): Promise<DailyMetricsResult> {
  const dateKey =
    typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date.trim())
      ? date.trim()
      : formatDateRiyadh(normalizeDateOnlyRiyadh(date));
  const monthKey = normalizeMonthKey(dateKey.slice(0, 7));

  const [boutiqueTargetRow, lastRecordedDateKey] = await Promise.all([
    db.boutiqueMonthlyTarget.findFirst({
      where: { boutiqueId, month: monthKey },
      select: { amount: true },
    }),
    findLastRecordedDateKey(db, boutiqueId, monthKey, dateKey),
  ]);

  const monthTargetSar = Math.trunc(boutiqueTargetRow?.amount ?? 0);

  const achievedMtdSar = lastRecordedDateKey
    ? Math.trunc(
        (
          await db.salesEntry.aggregate({
            where: {
              boutiqueId,
              month: monthKey,
              dateKey: { gte: `${monthKey}-01`, lte: lastRecordedDateKey },
            },
            _sum: { amount: true },
          })
        )._sum.amount ?? 0
      )
    : 0;

  const remainingMonthTargetSar = Math.max(0, monthTargetSar - achievedMtdSar);
  const daysRemainingIncludingToday = getDaysRemainingInMonthIncluding(monthKey, dateKey);
  const dailyTargetSar =
    remainingMonthTargetSar <= 0
      ? 0
      : Math.ceil(remainingMonthTargetSar / Math.max(1, daysRemainingIncludingToday));

  const dailyAchievedSar = Math.trunc(
    (
      await db.salesEntry.aggregate({
        where: { boutiqueId, dateKey },
        _sum: { amount: true },
      })
    )._sum.amount ?? 0
  );

  const dailyRemainingSar = Math.max(0, dailyTargetSar - dailyAchievedSar);
  const dailyExceededSar = Math.max(0, dailyAchievedSar - dailyTargetSar);
  const dailyAchievementPercent =
    dailyTargetSar > 0 ? Math.round((dailyAchievedSar * 100) / dailyTargetSar) : 0;

  return {
    boutiqueId,
    monthKey,
    dateKey,
    monthTargetSar,
    lastRecordedDateKey,
    achievedMtdSar,
    remainingMonthTargetSar,
    daysRemainingIncludingToday,
    dailyTargetSar,
    dailyAchievedSar,
    dailyRemainingSar,
    dailyExceededSar,
    dailyAchievementPercent,
  };
}

/** Reporting (calendar) allocation for a single Riyadh day — sum-of-daily-allocation piece for weekly reporting. */
export function reportingAllocationForDate(
  monthTargetSar: number,
  dateKey: string
): number {
  const mk = normalizeMonthKey(dateKey.slice(0, 7));
  const dim = getDaysInMonth(mk);
  const dom = dayOfMonthFromDateKey(dateKey);
  return getDailyTargetForDay(monthTargetSar, dim, dom);
}
