/**
 * Write admin actions to AuditLog (module ADMIN). Use for all admin CRUD.
 * AuditLog.boutiqueId is NOT NULL in DB; when not provided we use default or first boutique.
 */

import { prisma } from '@/lib/db';

const DEFAULT_BOUTIQUE_KEY = 'DEFAULT_BOUTIQUE_ID';

export type AdminAuditAction =
  | 'BOUTIQUE_CREATE' | 'BOUTIQUE_UPDATE' | 'BOUTIQUE_DISABLE'
  | 'BOUTIQUE_MANAGER_ASSIGNED' | 'BOUTIQUE_BOOTSTRAPPED'
  | 'REGION_CREATE' | 'REGION_UPDATE'
  | 'GROUP_CREATE' | 'GROUP_UPDATE' | 'GROUP_DISABLE' | 'GROUP_MEMBERS_UPDATE'
  | 'MEMBERSHIP_CREATE' | 'MEMBERSHIP_UPDATE' | 'MEMBERSHIP_DELETE'
  | 'SYSTEM_DEFAULT_BOUTIQUE_CHANGE'
  | 'EMPLOYEE_CHANGE_BOUTIQUE'
  | 'LEAVE_APPROVED' | 'LEAVE_REJECTED'
  | 'EXECUTIVE_GLOBAL_VIEW_ACCESSED';

async function resolveAuditBoutiqueId(boutiqueId: string | null | undefined): Promise<string> {
  if (boutiqueId) return boutiqueId;
  const row = await prisma.systemConfig.findUnique({
    where: { key: DEFAULT_BOUTIQUE_KEY },
    select: { valueJson: true },
  });
  if (row?.valueJson) {
    try {
      const parsed = JSON.parse(row.valueJson) as string;
      if (typeof parsed === 'string' && parsed) return parsed;
    } catch {
      // ignore
    }
  }
  const first = await prisma.boutique.findFirst({ orderBy: { code: 'asc' }, select: { id: true } });
  return first?.id ?? '';
}

export async function writeAdminAudit(params: {
  actorUserId: string;
  action: AdminAuditAction;
  entityType: string;
  entityId: string | null;
  beforeJson?: string | null;
  afterJson?: string | null;
  reason?: string | null;
  boutiqueId?: string | null;
}) {
  const boutiqueId = await resolveAuditBoutiqueId(params.boutiqueId);
  if (!boutiqueId) {
    throw new Error('AuditLog requires a boutiqueId; no default boutique configured.');
  }
  await prisma.auditLog.create({
    data: {
      module: 'ADMIN',
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      actorUserId: params.actorUserId,
      beforeJson: params.beforeJson ?? undefined,
      afterJson: params.afterJson ?? undefined,
      reason: params.reason ?? undefined,
      boutiqueId,
    },
  });
}
