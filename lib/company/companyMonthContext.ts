/**
 * Riyadh calendar context for company MTD aggregates (matches analytics builders).
 */

import type { Prisma } from '@prisma/client';
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

export function buildCompanyMonthContext(monthKeyInput?: string): CompanyMonthContext {
  const now = getRiyadhNow();
  const todayStr = toRiyadhDateString(now);
  const currentMonthKey = formatMonthKey(now);
  const monthKey = normalizeMonthKey(monthKeyInput?.trim() || currentMonthKey);
  const daysInMonth = getDaysInMonth(monthKey);
  let daysPassed: number;
  if (monthKey < currentMonthKey) {
    daysPassed = Math.max(1, daysInMonth);
  } else if (monthKey > currentMonthKey) {
    daysPassed = 1;
  } else {
    const day = new Date(todayStr + 'T00:00:00.000Z').getUTCDate();
    daysPassed = Math.min(Math.max(1, day), Math.max(1, daysInMonth));
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
