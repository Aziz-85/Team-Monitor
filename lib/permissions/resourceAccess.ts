/** Resource-level authorization helpers for IDOR-sensitive records. */

import { prisma } from '@/lib/db';
import {
  checkBoutiqueAccess,
  checkBoutiquePermission,
  type BoutiqueAccessUser,
} from '@/lib/permissions/boutiqueAccess';

export type ResourceAccessResult =
  | { allowed: true; boutiqueIds: string[] }
  | { allowed: false; reason: 'NOT_FOUND' | 'CROSS_BOUTIQUE' | 'MISSING_PERMISSION' };

/**
 * Validate access to a SalesEntry import batch by its persisted line boutique IDs.
 * The batch ID from the URL never grants access.
 */
export async function checkSalesEntryImportBatchAccess(
  user: BoutiqueAccessUser,
  batchId: string,
  options: { requireManageSales?: boolean } = {}
): Promise<ResourceAccessResult> {
  const batch = await prisma.salesEntryImportBatch.findUnique({
    where: { id: batchId },
    select: {
      id: true,
      lines: { select: { boutiqueId: true } },
    },
  });
  if (!batch) return { allowed: false, reason: 'NOT_FOUND' };

  const boutiqueIds = Array.from(new Set(batch.lines.map((line) => line.boutiqueId)));
  if (boutiqueIds.length === 0) return { allowed: false, reason: 'NOT_FOUND' };

  for (const boutiqueId of boutiqueIds) {
    const result = options.requireManageSales
      ? await checkBoutiquePermission(user, boutiqueId, 'canManageSales')
      : await checkBoutiqueAccess(user, boutiqueId);
    if (!result.allowed) {
      return {
        allowed: false,
        reason:
          result.reason === 'MISSING_PERMISSION'
            ? 'MISSING_PERMISSION'
            : 'CROSS_BOUTIQUE',
      };
    }
  }

  return { allowed: true, boutiqueIds };
}
