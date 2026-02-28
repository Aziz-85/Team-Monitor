/**
 * Resolve boutique IDs for executive APIs. Server-side only.
 * - MANAGER / non-ADMIN: single operational boutique (effectiveBoutiqueId).
 * - ADMIN: if global=true param, use all active boutiques and audit; else single operational boutique.
 * Never trust query param alone: global is only applied when role === 'ADMIN' or 'SUPER_ADMIN'.
 */

import { prisma } from '@/lib/db';
import { resolveOperationalBoutiqueId } from '@/lib/boutique/resolveOperationalBoutique';
import { writeAdminAudit } from '@/lib/admin/audit';
import type { Role } from '@prisma/client';

export type ExecutiveScopeResult = {
  boutiqueIds: string[];
  isGlobal: boolean;
};

/**
 * Returns boutique IDs for executive compare/employees APIs.
 * globalParam: from query (e.g. searchParams.get('global') === 'true').
 * Only ADMIN can use global; otherwise single operational boutique is used (no REGION/GROUP).
 */
export async function resolveExecutiveBoutiqueIds(
  userId: string,
  role: Role,
  globalParam: string | null,
  module: 'EXECUTIVE_COMPARE' | 'EXECUTIVE_EMPLOYEES'
): Promise<ExecutiveScopeResult> {
  const useGlobal = (role === 'ADMIN' || role === 'SUPER_ADMIN') && globalParam === 'true';

  if (!useGlobal) {
    const { boutiqueId } = await resolveOperationalBoutiqueId(userId, role, null);
    const boutiqueIds = boutiqueId ? [boutiqueId] : [];
    return { boutiqueIds, isGlobal: false };
  }

  const all = await prisma.boutique.findMany({
    where: { isActive: true },
    select: { id: true },
    orderBy: { code: 'asc' },
  });
  const boutiqueIds = all.map((b) => b.id);

  await writeAdminAudit({
    actorUserId: userId,
    action: 'EXECUTIVE_GLOBAL_VIEW_ACCESSED',
    entityType: module,
    entityId: null,
    afterJson: JSON.stringify({
      module,
      actorId: userId,
      timestamp: new Date().toISOString(),
    }),
    boutiqueId: boutiqueIds[0] ?? undefined,
  });

  return { boutiqueIds, isGlobal: true };
}
