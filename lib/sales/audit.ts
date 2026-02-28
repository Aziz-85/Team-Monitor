/**
 * Audit trail for daily sales ledger actions.
 */

import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';

export type SalesLedgerAction =
  | 'SUMMARY_CREATE'
  | 'SUMMARY_UPDATE'
  | 'LINE_UPSERT'
  | 'LOCK'
  | 'UNLOCK'
  | 'IMPORT_APPLY'
  | 'POST_LOCK_EDIT';

export async function recordSalesLedgerAudit(params: {
  boutiqueId: string;
  date: Date;
  actorId: string;
  action: SalesLedgerAction;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  await prisma.salesLedgerAudit.create({
    data: {
      boutiqueId: params.boutiqueId,
      date: params.date,
      actorId: params.actorId,
      action: params.action,
      reason: params.reason ?? undefined,
      metadata: (params.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}
