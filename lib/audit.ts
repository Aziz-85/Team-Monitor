import { prisma } from '@/lib/db';

export type AuditModule = 'SCHEDULE' | 'INVENTORY' | 'TEAM' | 'LOCK' | 'APPROVALS';

const DEFAULT_BOUTIQUE_KEY = 'DEFAULT_BOUTIQUE_ID';

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

export async function logAudit(
  actorUserId: string,
  action: string,
  entityType: string,
  entityId: string | null,
  beforeJson: string | null,
  afterJson: string | null,
  reason: string | null = null,
  options?: {
    module?: AuditModule;
    targetEmployeeId?: string | null;
    targetDate?: Date | string | null;
    weekStart?: Date | string | null;
    boutiqueId?: string | null;
  }
) {
  const targetDate = options?.targetDate
    ? typeof options.targetDate === 'string'
      ? new Date(options.targetDate + 'T00:00:00Z')
      : options.targetDate
    : null;
  const weekStart = options?.weekStart
    ? typeof options.weekStart === 'string'
      ? new Date(options.weekStart + 'T00:00:00Z')
      : options.weekStart
    : null;

  const boutiqueId = await resolveAuditBoutiqueId(options?.boutiqueId);

  await prisma.auditLog.create({
    data: {
      actorUserId,
      action,
      entityType,
      entityId,
      beforeJson,
      afterJson,
      reason,
      module: options?.module ?? null,
      targetEmployeeId: options?.targetEmployeeId ?? null,
      targetDate,
      weekStart,
      boutiqueId,
    },
  });
}
