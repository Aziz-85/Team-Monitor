/**
 * Sync Daily Sales Ledger (BoutiqueSalesSummary + BoutiqueSalesLine) to SalesEntry.
 * Executive/Dashboard/Monthly read from SalesEntry; ledger writes must flow here.
 * Idempotent, day-by-day: dateKey (YYYY-MM-DD Riyadh), unique (boutiqueId, dateKey, userId), safe delete (LEDGER only).
 */

import { prisma } from '@/lib/db';
import { formatDateRiyadh, formatMonthKey, normalizeDateOnlyRiyadh } from '@/lib/time';

const SALES_ENTRY_SOURCE_LEDGER = 'LEDGER';

export type SyncSummaryResult = {
  upserted: number;
  skipped: number;
  unmappedCount: number;
  unmappedEmpIds: string[];
};

/**
 * Sync all lines of a summary to SalesEntry for that date and boutique.
 * Uses dateKey (YYYY-MM-DD Riyadh) so ledger and SalesEntry keys never drift.
 * Upsert by (boutiqueId, dateKey, userId); sets source='LEDGER'.
 * Deletes ONLY SalesEntry rows with source='LEDGER' for this dateKey+boutique whose userId is not in current lines.
 */
export async function syncSummaryToSalesEntry(
  summaryId: string,
  createdById: string
): Promise<SyncSummaryResult> {
  const summary = await prisma.boutiqueSalesSummary.findUnique({
    where: { id: summaryId },
    include: { lines: true },
  });
  if (!summary) return { upserted: 0, skipped: 0, unmappedCount: 0, unmappedEmpIds: [] };

  const dateOnly = normalizeDateOnlyRiyadh(summary.date);
  const dateKey = formatDateRiyadh(dateOnly);
  const monthKey = formatMonthKey(dateOnly);
  const boutiqueId = summary.boutiqueId;

  const userIdsInLines = new Set<string>();
  const unmappedEmpIds: string[] = [];

  if (summary.lines.length > 0) {
    const empIds = summary.lines.map((l) => l.employeeId).filter(Boolean);
    const users = await prisma.user.findMany({
      where: { empId: { in: empIds } },
      select: { id: true, empId: true },
    });
    const userIdByEmpId = new Map(users.map((u) => [u.empId, u.id]));
    for (const line of summary.lines) {
      const uid = userIdByEmpId.get(line.employeeId);
      if (uid) userIdsInLines.add(uid);
      else unmappedEmpIds.push(line.employeeId);
    }

    for (const line of summary.lines) {
      const userId = userIdByEmpId.get(line.employeeId);
      if (!userId) continue;
      await prisma.salesEntry.upsert({
        where: {
          boutiqueId_dateKey_userId: { boutiqueId, dateKey, userId },
        },
        create: {
          userId,
          date: dateOnly,
          dateKey,
          month: monthKey,
          boutiqueId,
          amount: line.amountSar,
          source: SALES_ENTRY_SOURCE_LEDGER,
          createdById,
        },
        update: {
          amount: line.amountSar,
          month: monthKey,
          source: SALES_ENTRY_SOURCE_LEDGER,
          updatedAt: new Date(),
        },
      });
    }
  }

  // Safe delete: only LEDGER rows for this exact dateKey+boutique whose userId is not in current lines
  if (userIdsInLines.size > 0) {
    const staleUserIds = await prisma.salesEntry
      .findMany({
        where: {
          boutiqueId,
          dateKey,
          source: SALES_ENTRY_SOURCE_LEDGER,
          userId: { notIn: Array.from(userIdsInLines) },
        },
        select: { userId: true },
      })
      .then((rows) => rows.map((r) => r.userId));
    if (staleUserIds.length > 0) {
      await prisma.salesEntry.deleteMany({
        where: {
          boutiqueId,
          dateKey,
          source: SALES_ENTRY_SOURCE_LEDGER,
          userId: { in: staleUserIds },
        },
      });
    }
  } else {
    await prisma.salesEntry.deleteMany({
      where: { boutiqueId, dateKey, source: SALES_ENTRY_SOURCE_LEDGER },
    });
  }

  const unmappedCount = unmappedEmpIds.length;
  if (unmappedCount > 0 && process.env.NODE_ENV === 'development') {
    console.warn(
      '[syncSummaryToSalesEntry] Unmapped empIds (no User), excluded from SalesEntry:',
      unmappedEmpIds,
      '— ensure User.empId exists for these employees if they should appear in Dashboard.'
    );
  }
  return {
    upserted: summary.lines.length - unmappedCount,
    skipped: unmappedCount,
    unmappedCount,
    unmappedEmpIds,
  };
}
