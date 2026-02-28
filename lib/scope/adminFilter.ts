/**
 * Admin filter types and resolver.
 * Used only on /admin/* pages; separate from operational scope (scopeJson).
 */

import { prisma } from '@/lib/db';

export type AdminFilterKind = 'ALL' | 'BOUTIQUE' | 'REGION' | 'GROUP';

export type AdminFilterJson = {
  kind: AdminFilterKind;
  boutiqueId?: string;
  regionId?: string;
  groupId?: string;
};

/** Resolve admin filter to boutique IDs for WHERE clauses. Returns null = no filter (all). */
export async function resolveAdminFilterToBoutiqueIds(
  filter: AdminFilterJson | null
): Promise<string[] | null> {
  if (!filter || filter.kind === 'ALL') return null;
  if (filter.kind === 'BOUTIQUE' && filter.boutiqueId) return [filter.boutiqueId];
  if (filter.kind === 'REGION' && filter.regionId) {
    const boutiques = await prisma.boutique.findMany({
      where: { regionId: filter.regionId, isActive: true },
      select: { id: true },
    });
    return boutiques.map((b) => b.id);
  }
  if (filter.kind === 'GROUP' && filter.groupId) {
    const members = await prisma.boutiqueGroupMember.findMany({
      where: { boutiqueGroupId: filter.groupId, boutique: { isActive: true } },
      select: { boutiqueId: true },
    });
    return members.map((m) => m.boutiqueId);
  }
  return null;
}

/** Build human-readable label for admin filter. */
export async function getAdminFilterLabel(filter: AdminFilterJson | null): Promise<string> {
  if (!filter || filter.kind === 'ALL') return 'All boutiques';
  if (filter.kind === 'BOUTIQUE' && filter.boutiqueId) {
    const b = await prisma.boutique.findUnique({
      where: { id: filter.boutiqueId },
      select: { name: true, code: true },
    });
    return b ? `${b.name} (${b.code})` : filter.boutiqueId;
  }
  if (filter.kind === 'REGION' && filter.regionId) {
    const r = await prisma.region.findUnique({
      where: { id: filter.regionId },
      select: { name: true },
    });
    return r ? `Region: ${r.name}` : filter.regionId;
  }
  if (filter.kind === 'GROUP' && filter.groupId) {
    const g = await prisma.boutiqueGroup.findUnique({
      where: { id: filter.groupId },
      select: { name: true },
    });
    return g ? `Group: ${g.name}` : filter.groupId;
  }
  return 'All boutiques';
}
