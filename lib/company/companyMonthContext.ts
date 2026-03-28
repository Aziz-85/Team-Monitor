/**
 * Riyadh calendar context for company MTD aggregates (matches analytics builders).
 */

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { paceDaysPassedForMonth } from '@/lib/analytics/performanceLayer';
import {
  formatMonthKey,
  getDaysInMonth,
  getRiyadhNow,
  normalizeMonthKey,
  toRiyadhDateString,
} from '@/lib/time';

export type CompanyMonthContext = {
  monthKey: string;
  todayStr: string;
  currentMonthKey: string;
  daysInMonth: number;
  daysPassed: number;
  mtdSalesWhereBase: (boutiqueIds: string[]) => Prisma.SalesEntryWhereInput;
};

export async function buildCompanyMonthContext(
  monthKeyInput?: string,
  options?: { boutiqueIds: string[] }
): Promise<CompanyMonthContext> {
  const now = getRiyadhNow();
  const todayStr = toRiyadhDateString(now);
  const currentMonthKey = formatMonthKey(now);
  const monthKey = normalizeMonthKey(monthKeyInput?.trim() || currentMonthKey);
  const daysInMonth = getDaysInMonth(monthKey);
  let daysPassed: number;
  if (monthKey < currentMonthKey) {
    daysPassed = Math.max(0, daysInMonth);
  } else if (monthKey > currentMonthKey) {
    daysPassed = 1;
  } else {
    const calDay = new Date(todayStr + 'T00:00:00.000Z').getUTCDate();
    const ids = options?.boutiqueIds?.filter(Boolean) ?? [];
    let hasEntry = false;
    if (ids.length > 0) {
      const c = await prisma.salesEntry.count({
        where: {
          month: normalizeMonthKey(monthKey),
          boutiqueId: { in: ids },
          dateKey: todayStr,
        },
      });
      hasEntry = c > 0;
    }
    daysPassed = paceDaysPassedForMonth(calDay, daysInMonth, hasEntry);
  }

  const mtdSalesWhereBase = (boutiqueIds: string[]): Prisma.SalesEntryWhereInput => {
    const base: Prisma.SalesEntryWhereInput = {
      month: normalizeMonthKey(monthKey),
      boutiqueId: { in: boutiqueIds },
    };
    if (monthKey > currentMonthKey) {
      return { ...base, id: { in: [] } };
    }
    if (monthKey === currentMonthKey) {
      return { ...base, dateKey: { lte: todayStr } };
    }
    return base;
  };

  return {
    monthKey,
    todayStr,
    currentMonthKey,
    daysInMonth,
    daysPassed,
    mtdSalesWhereBase,
  };
}
