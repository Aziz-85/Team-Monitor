/**
 * Record a boutique daily sales line (ledger) and sync to canonical SalesEntry.
 * **Single write path** for manager manual daily lines — routes must not duplicate this logic.
 */

import type { SalesLineSource } from '@prisma/client';
import { prisma } from '@/lib/db';
import { recordSalesLedgerAudit } from '@/lib/sales/audit';
import { reconcileSummary } from '@/lib/sales/reconcile';
import { syncSalesProjectionsFromSummary } from '@/lib/sales/syncSalesProjections';
import { getSystemBranchTotalUserId } from '@/lib/sales/systemBranchTotal';
import { SYSTEM_BRANCH_TOTAL_EMP_ID } from '@/lib/sales/systemBranchTotalConstants';
import { SALES_ENTRY_SOURCE } from '@/lib/sales/salesEntrySources';
import { collectImportSalesWarnings } from '@/lib/sales/salesOwnershipWarnings';
import type {
  RecordBoutiqueSaleInput,
  RecordBoutiqueSaleResult,
  RemoveBoutiqueSaleLineInput,
  RemoveBoutiqueSaleLineResult,
} from '@/lib/sales/types';
import { formatDateRiyadh, normalizeDateOnlyRiyadh } from '@/lib/time';

async function ensureSummary(
  boutiqueId: string,
  date: Date,
  actorUserId: string
) {
  let summary = await prisma.boutiqueSalesSummary.findUnique({
    where: { boutiqueId_date: { boutiqueId, date } },
    include: { lines: true },
  });
  if (summary) return summary;

  summary = await prisma.boutiqueSalesSummary.create({
    data: {
      boutiqueId,
      date,
      totalSar: 0,
      status: 'DRAFT',
      enteredById: actorUserId,
    },
    include: { lines: true },
  });
  await recordSalesLedgerAudit({
    boutiqueId,
    date,
    actorId: actorUserId,
    action: 'SUMMARY_CREATE',
    metadata: { totalSar: 0, autoCreated: true },
  });
  return summary;
}

async function unlockIfLocked(
  summaryId: string,
  boutiqueId: string,
  date: Date,
  actorUserId: string,
  reason: string,
  metadata: Record<string, unknown>
): Promise<boolean> {
  const summary = await prisma.boutiqueSalesSummary.findUnique({
    where: { id: summaryId },
    select: { status: true },
  });
  if (summary?.status !== 'LOCKED') return false;

  await prisma.boutiqueSalesSummary.update({
    where: { id: summaryId },
    data: { status: 'DRAFT', lockedById: null, lockedAt: null },
  });
  await recordSalesLedgerAudit({
    boutiqueId,
    date,
    actorId: actorUserId,
    action: 'POST_LOCK_EDIT',
    reason,
    metadata,
  });
  return true;
}

/**
 * Upsert one employee line on the daily ledger and project to SalesEntry.
 */
export async function recordBoutiqueSale(
  input: RecordBoutiqueSaleInput
): Promise<RecordBoutiqueSaleResult> {
  const {
    boutiqueId,
    date,
    employeeId,
    amountSar,
    actorUserId,
    lineSource = 'MANUAL',
    requireEmployeeInBoutique = true,
  } = input;

  if (employeeId === SYSTEM_BRANCH_TOTAL_EMP_ID) {
    return {
      ok: false,
      error: 'This employee cannot be used on daily sales lines.',
      status: 'validation',
    };
  }

  const dateOnly = normalizeDateOnlyRiyadh(date);
  const dateKey = formatDateRiyadh(dateOnly);

  const employee = await prisma.employee.findUnique({
    where: { empId: employeeId },
    select: { boutiqueId: true, user: { select: { id: true } } },
  });

  if (!employee) {
    return { ok: false, error: 'Employee not found', status: 'validation' };
  }

  if (requireEmployeeInBoutique && employee.boutiqueId !== boutiqueId) {
    return {
      ok: false,
      error: 'Employee must belong to this boutique',
      status: 'validation',
    };
  }

  const warnings = await collectImportSalesWarnings({
    boutiqueId,
    empId: employeeId,
    dateKey,
    userId: employee.user?.id,
  });

  if (amountSar > 0) {
    const sysUid = await getSystemBranchTotalUserId();
    if (sysUid) {
      const branchBlock = await prisma.salesEntry.findFirst({
        where: {
          boutiqueId,
          dateKey,
          userId: sysUid,
          amount: { gt: 0 },
          source: SALES_ENTRY_SOURCE.BRANCH_DAILY_TOTAL,
        },
        select: { id: true },
      });
      if (branchBlock) {
        return {
          ok: false,
          error:
            'Cannot save employee line because a branch daily total is recorded for this date. Remove or zero the daily total first.',
          status: 'conflict',
        };
      }
    }
  }

  const summary = await ensureSummary(boutiqueId, dateOnly, actorUserId);
  const wasLocked = await unlockIfLocked(summary.id, boutiqueId, dateOnly, actorUserId, 'Line upsert after lock; auto-unlock', {
    summaryId: summary.id,
    employeeId,
    amountSar,
  });

  const existingLine = summary.lines.find((l) => l.employeeId === employeeId);
  let lineId: string;
  if (existingLine) {
    await prisma.boutiqueSalesLine.update({
      where: { id: existingLine.id },
      data: { amountSar, updatedAt: new Date() },
    });
    lineId = existingLine.id;
  } else {
    const created = await prisma.boutiqueSalesLine.create({
      data: {
        summaryId: summary.id,
        employeeId,
        amountSar,
        source: lineSource as SalesLineSource,
      },
    });
    lineId = created.id;
  }

  await recordSalesLedgerAudit({
    boutiqueId,
    date: dateOnly,
    actorId: actorUserId,
    action: 'LINE_UPSERT',
    metadata: { employeeId, amountSar, wasLocked },
  });

  const sync = await syncSalesProjectionsFromSummary(summary.id, actorUserId);
  const reconcile = await reconcileSummary(summary.id);
  if (!reconcile) {
    return { ok: false, error: 'Summary reconcile failed', status: 'not_found' };
  }

  return {
    ok: true,
    summaryId: summary.id,
    lineId,
    warnings,
    sync,
    reconcile,
    wasLocked,
  };
}

/** Remove one employee line and re-sync projections. */
export async function removeBoutiqueSaleLine(
  input: RemoveBoutiqueSaleLineInput
): Promise<RemoveBoutiqueSaleLineResult> {
  const { boutiqueId, date, employeeId, actorUserId } = input;
  const dateOnly = normalizeDateOnlyRiyadh(date);

  const summary = await prisma.boutiqueSalesSummary.findUnique({
    where: { boutiqueId_date: { boutiqueId, date: dateOnly } },
    include: { lines: true },
  });
  if (!summary) {
    return { ok: false, error: 'No summary for this boutique and date', status: 'not_found' };
  }

  const existingLine = summary.lines.find((l) => l.employeeId === employeeId);
  if (!existingLine) {
    return { ok: false, error: 'Line not found', status: 'not_found' };
  }

  const wasLocked = await unlockIfLocked(summary.id, boutiqueId, dateOnly, actorUserId, 'Line delete after lock; auto-unlock', {
    summaryId: summary.id,
    employeeId,
  });

  await prisma.boutiqueSalesLine.delete({ where: { id: existingLine.id } });

  await recordSalesLedgerAudit({
    boutiqueId,
    date: dateOnly,
    actorId: actorUserId,
    action: 'LINE_DELETE',
    metadata: { employeeId, wasLocked },
  });

  const sync = await syncSalesProjectionsFromSummary(summary.id, actorUserId);
  const reconcile = await reconcileSummary(summary.id);

  return {
    ok: true,
    summaryId: summary.id,
    sync,
    reconcile,
    wasLocked,
  };
}
