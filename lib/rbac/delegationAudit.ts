/**
 * Audit log for delegation grant create/revoke.
 */

import { prisma } from '@/lib/db';

export type DelegationAuditAction = 'GRANT_CREATE' | 'GRANT_REVOKE';

export async function writeDelegationAudit(params: {
  boutiqueId: string;
  actorUserId: string;
  targetUserId: string;
  action: DelegationAuditAction;
  metadata: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  await prisma.delegationAuditLog.create({
    data: {
      boutiqueId: params.boutiqueId,
      actorUserId: params.actorUserId,
      targetUserId: params.targetUserId,
      action: params.action,
      metadata: params.metadata as object,
      ip: params.ip ?? undefined,
      userAgent: params.userAgent ?? undefined,
    },
  });
}
