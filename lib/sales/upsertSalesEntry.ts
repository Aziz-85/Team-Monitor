/**
 * **Canonical write service for SalesEntry** — the only approved way to create/update rows.
 *
 * - One row per (boutiqueId, dateKey, userId) — DB `@@unique([boutiqueId, dateKey, userId])`.
 * - Precedence: `lib/sales/salesEntryWritePrecedence.ts` (do not duplicate in routes).
 * - Locks: `kind: 'direct'` respects BoutiqueSalesSummary LOCK unless `allowLockedOverride`.
 * - `kind: 'ledger_sync'` skips summary lock (ledger pipeline is authoritative for that sync).
 *
 * **Governance:** successful responses include `signals` (previous/incoming source, force flag) for audit/APIs.
 * Deletes / bulk admin tools are out of band; they must not create duplicate keys.
 */

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { formatDateRiyadh, formatMonthKey, normalizeDateOnlyRiyadh } from '@/lib/time';
import { isBoutiqueSalesDayLedgerLocked } from '@/lib/sales/ledgerLock';
import { incomingSalesWriteWinsPrecedence } from '@/lib/sales/salesEntryWritePrecedence';

export type UpsertSalesEntryKind = 'ledger_sync' | 'direct';

export type SalesWriteSignals = {
  previousSource: string | null;
  incomingSource: string;
  wasForceOverride: boolean;
  decision: 'created' | 'updated' | 'no_change';
};

export type UpsertCanonicalSalesEntryInput = {
  boutiqueId: string;
  userId: string;
  amount: number;
  /** Stored on SalesEntry.source (TEXT). */
  source: string;
  /** Original creator; unchanged on update (schema has no updatedById). */
  actorUserId: string;
  date: Date | string;
  kind: UpsertSalesEntryKind;
  /**
   * For `direct` writes: when true (default), block if the daily ledger summary for that
   * boutique+day is LOCKED. Set false only for ledger-driven sync or documented overrides.
   */
  respectLedgerLock?: boolean;
  /** When true, skip ledger lock check (e.g. admin forced matrix overwrite). */
  allowLockedOverride?: boolean;
  /**
   * When true: skip source precedence (ADMIN/SUPER_ADMIN + explicit client `force` only).
   * Callers must enforce RBAC before setting.
   */
  forceAdminOverride?: boolean;
  /** Optional transaction client (e.g. matrix import `prisma.$transaction`). */
  tx?: Prisma.TransactionClient;
  /** When set (admin import), stored on SalesEntry for rollback / audit. */
  entryImportBatchId?: string | null;
};

export type UpsertCanonicalSalesEntryResult =
  | { status: 'created'; signals: SalesWriteSignals; salesEntryId: string }
  | { status: 'updated'; signals: SalesWriteSignals; salesEntryId: string }
  | { status: 'no_change'; signals: SalesWriteSignals; salesEntryId: string }
  | { status: 'rejected_locked' }
  | {
      status: 'rejected_precedence';
      existingSource: string | null;
      incomingSource: string;
    }
  | { status: 'rejected_invalid'; reason: string };

export async function upsertCanonicalSalesEntry(
  input: UpsertCanonicalSalesEntryInput
): Promise<UpsertCanonicalSalesEntryResult> {
  const db = input.tx ?? prisma;
  const { amount, userId, boutiqueId, source, actorUserId, kind } = input;
  if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount < 0) {
    return { status: 'rejected_invalid', reason: 'amount must be a non-negative integer (SAR)' };
  }

  const dateOnly = normalizeDateOnlyRiyadh(input.date);
  const dateKey = formatDateRiyadh(dateOnly);
  const month = formatMonthKey(dateOnly);

  const respectLock = input.respectLedgerLock !== false;
  const allowLockedOverride = input.allowLockedOverride === true;
  const forceAdminOverride = input.forceAdminOverride === true;

  if (kind === 'direct' && respectLock && !allowLockedOverride) {
    const locked = await isBoutiqueSalesDayLedgerLocked(boutiqueId, dateOnly);
    if (locked) {
      return { status: 'rejected_locked' };
    }
  }

  const existing = await db.salesEntry.findUnique({
    where: { boutiqueId_dateKey_userId: { boutiqueId, dateKey, userId } },
    select: { id: true, amount: true, source: true },
  });

  if (existing) {
    const mayWrite = incomingSalesWriteWinsPrecedence(existing.source, source, { forceAdminOverride });
    if (!mayWrite) {
      return {
        status: 'rejected_precedence',
        existingSource: existing.source,
        incomingSource: source,
      };
    }
    if (
      existing.amount === amount &&
      (existing.source ?? '').trim().toUpperCase() === source.trim().toUpperCase()
    ) {
      return {
        status: 'no_change',
        signals: {
          previousSource: existing.source,
          incomingSource: source,
          wasForceOverride: forceAdminOverride,
          decision: 'no_change',
        },
        salesEntryId: existing.id,
      };
    }
  }

  const signals: SalesWriteSignals = {
    previousSource: existing?.source ?? null,
    incomingSource: source,
    wasForceOverride: forceAdminOverride,
    decision: existing ? 'updated' : 'created',
  };

  const batchId = input.entryImportBatchId;
  const row = await db.salesEntry.upsert({
    where: {
      boutiqueId_dateKey_userId: { boutiqueId, dateKey, userId },
    },
    create: {
      userId,
      date: dateOnly,
      dateKey,
      month,
      boutiqueId,
      amount,
      source,
      createdById: actorUserId,
      ...(batchId ? { entryImportBatchId: batchId } : {}),
    },
    update: {
      amount,
      month,
      source,
      updatedAt: new Date(),
      ...(batchId ? { entryImportBatchId: batchId } : {}),
    },
    select: { id: true },
  });

  return existing ? { status: 'updated', signals, salesEntryId: row.id } : { status: 'created', signals, salesEntryId: row.id };
}
