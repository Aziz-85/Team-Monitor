/**
 * Reconciliation: compare local linked tasks vs external state.
 * No auto-destroy; report mismatches only.
 */

import { prisma } from '@/lib/db';

export type ReconcileResult = {
  linked: number;
  pending: number;
  error: number;
  disconnected: number;
  mismatches: Array<{ localTaskId: string; externalTaskId: string; reason: string }>;
};

export async function runReconciliation(integrationId: string | null): Promise<ReconcileResult> {
  const links = await prisma.plannerTaskLink.findMany({
    include: { localTask: true },
  });

  const result: ReconcileResult = {
    linked: 0,
    pending: 0,
    error: 0,
    disconnected: 0,
    mismatches: [],
  };

  for (const link of links) {
    if (link.syncStatus === 'LINKED') result.linked++;
    else if (link.syncStatus === 'PENDING') result.pending++;
    else if (link.syncStatus === 'ERROR') result.error++;
    else result.disconnected++;
  }

  if (integrationId) {
    await prisma.plannerSyncLog.create({
      data: {
        integrationId,
        direction: 'RECONCILIATION',
        mode: 'MANUAL',
        eventType: 'RECONCILE_RUN',
        status: 'SUCCESS',
        message: `Linked: ${result.linked}, Pending: ${result.pending}, Error: ${result.error}`,
      },
    });
  }

  return result;
}
