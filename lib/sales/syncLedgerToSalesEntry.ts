/**
 * Sync Daily Sales Ledger (BoutiqueSalesSummary + BoutiqueSalesLine) to SalesEntry.
 *
 * **SalesEntry** is the canonical read model for reporting; this sync is the approved path
 * from ledger lines → canonical rows. Stale row deletes (same source, missing userIds) stay here.
 */

import { prisma } from '@/lib/db';
import { formatDateRiyadh, normalizeDateOnlyRiyadh } from '@/lib/time';
import { upsertCanonicalSalesEntry } from '@/lib/sales/upsertSalesEntry';

const SALES_ENTRY_SOURCE_LEDGER = 'LEDGER';

export type SyncSummaryResult = {
  upserted: number;
  skipped: number;
  /** Rows not written because SalesEntry already had a higher-precedence source (e.g. MANUAL). */
  precedenceRejected: number;
  unmappedCount: number;
  unmappedEmpIds: string[];
};

/**
 * Sync all lines of a summary to SalesEntry for that date and boutique.
 * Uses dateKey (YYYY-MM-DD Riyadh) so ledger and SalesEntry keys never drift.
 * Upsert by (boutiqueId, dateKey, userId); sets source to sourceForEntry (default 'LEDGER').
 * Deletes ONLY SalesEntry rows with that source for this dateKey+boutique whose userId is not in current lines.
 */
export async function syncSummaryToSalesEntry(
  summaryId: string,
  createdById: string,
  sourceForEntry: string = SALES_ENTRY_SOURCE_LEDGER
): Promise<SyncSummaryResult> {
  const summary = await prisma.boutiqueSalesSummary.findUnique({
    where: { id: summaryId },
    include: { lines: true },
  });
  if (!summary) return { upserted: 0, skipped: 0, precedenceRejected: 0, unmappedCount: 0, unmappedEmpIds: [] };

  const dateOnly = normalizeDateOnlyRiyadh(summary.date);
  const dateKey = formatDateRiyadh(dateOnly);
  const boutiqueId = summary.boutiqueId;

  const userIdsInLines = new Set<string>();
  const unmappedEmpIds: string[] = [];
  let precedenceRejected = 0;
  let upsertedCount = 0;

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
      const res = await upsertCanonicalSalesEntry({
        kind: 'ledger_sync',
        boutiqueId,
        userId,
        amount: line.amountSar,
        source: sourceForEntry,
        actorUserId: createdById,
        date: dateOnly,
      });
      if (res.status === 'rejected_precedence') {
        precedenceRejected += 1;
      } else {
        upsertedCount += 1;
      }
    }
  }

  // Safe delete: only rows with this source for this dateKey+boutique whose userId is not in current lines
  if (userIdsInLines.size > 0) {
    const staleUserIds = await prisma.salesEntry
      .findMany({
        where: {
          boutiqueId,
          dateKey,
          source: sourceForEntry,
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
          source: sourceForEntry,
          userId: { in: staleUserIds },
        },
      });
    }
  } else {
    await prisma.salesEntry.deleteMany({
      where: { boutiqueId, dateKey, source: sourceForEntry },
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
    upserted: upsertedCount,
    skipped: unmappedCount,
    precedenceRejected,
    unmappedCount,
    unmappedEmpIds,
  };
}
