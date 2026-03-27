/**
 * Company / Backoffice scope — read-only aggregation across boutiques.
 * Phase 1: SUPER_ADMIN sees all active boutiques. Other roles: no company scope.
 */

import type { Role } from '@prisma/client';
import { prisma } from '@/lib/db';

export async function resolveCompanyBoutiqueIds(role: Role): Promise<string[]> {
  if (role !== 'SUPER_ADMIN') return [];
  const boutiques = await prisma.boutique.findMany({
    where: { isActive: true },
    select: { id: true },
    orderBy: { code: 'asc' },
  });
  return boutiques.map((b) => b.id);
}
