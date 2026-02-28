/**
 * KPI audit logging. All actions logged for compliance.
 */

import { prisma } from '@/lib/db';

export type KpiAuditAction =
  | 'KPI_TEMPLATE_SEEDED'
  | 'KPI_UPLOAD_CREATED'
  | 'KPI_UPLOAD_PARSED'
  | 'KPI_UPLOAD_FAILED'
  | 'KPI_UPLOAD_DELETED'
  | 'KPI_SNAPSHOT_VIEWED';

export async function logKpiAudit(params: {
  actorId: string;
  action: KpiAuditAction;
  boutiqueId?: string | null;
  empId?: string | null;
  periodKey?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  await prisma.kpiAuditLog.create({
    data: {
      actorId: params.actorId,
      action: params.action,
      boutiqueId: params.boutiqueId ?? null,
      empId: params.empId ?? null,
      periodKey: params.periodKey ?? null,
      metadata: (params.metadata ?? undefined) as object | undefined,
    },
  });
}
