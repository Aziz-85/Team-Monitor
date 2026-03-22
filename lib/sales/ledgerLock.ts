/**
 * Daily Sales Ledger lock state (BoutiqueSalesSummary.status === LOCKED).
 * Used by canonical SalesEntry writes that bypass the ledger UI (e.g. employee manual row).
 */

import { prisma } from '@/lib/db';
import { addDays, startOfDayRiyadh, normalizeDateOnlyRiyadh } from '@/lib/time';

/**
 * True when a summary exists for boutique+day and is LOCKED.
 * If no summary exists, the day is not ledger-locked from SalesEntry's perspective.
 */
export async function isBoutiqueSalesDayLedgerLocked(
  boutiqueId: string,
  date: Date | string
): Promise<boolean> {
  const dateOnly = normalizeDateOnlyRiyadh(date);
  const dayStart = startOfDayRiyadh(dateOnly);
  const dayEnd = addDays(dayStart, 1);
  const summary = await prisma.boutiqueSalesSummary.findFirst({
    where: {
      boutiqueId,
      date: { gte: dayStart, lt: dayEnd },
    },
    select: { status: true },
  });
  return summary?.status === 'LOCKED';
}
