import { prisma } from '@/lib/db';

export type LeaveAuditAction =
  | 'LEAVE_SUBMITTED'
  | 'LEAVE_APPROVED_MANAGER'
  | 'LEAVE_APPROVED_ADMIN'
  | 'LEAVE_ESCALATED'
  | 'LEAVE_REJECTED'
  | 'LEAVE_CANCELLED';

export async function writeLeaveAudit(params: {
  actorUserId: string;
  action: LeaveAuditAction;
  entityId: string;
  boutiqueId: string;
  beforeJson?: string;
  afterJson?: string;
  reason?: string;
}) {
  await prisma.auditLog.create({
    data: {
      module: 'LEAVE',
      action: params.action,
      entityType: 'LEAVE_REQUEST',
      entityId: params.entityId,
      actorUserId: params.actorUserId,
      beforeJson: params.beforeJson ?? undefined,
      afterJson: params.afterJson ?? undefined,
      reason: params.reason ?? undefined,
      boutiqueId: params.boutiqueId,
    },
  });
}
