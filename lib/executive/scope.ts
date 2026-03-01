/**
 * Resolve boutique IDs for executive APIs. Server-side only.
 * Delegates to ssotScope.resolveBoutiqueIdsWithOptionalGlobal for consistency.
 * - MANAGER / non-ADMIN: single operational boutique (session).
 * - ADMIN: if global=true param, use all active boutiques and audit; else single operational boutique.
 * Never trust query param alone: global is only applied when role === 'ADMIN' or 'SUPER_ADMIN'.
 */

import type { NextRequest } from 'next/server';
import { resolveBoutiqueIdsWithOptionalGlobal } from '@/lib/scope/ssot';
import type { Role } from '@prisma/client';

export type ExecutiveScopeResult = {
  boutiqueIds: string[];
  isGlobal: boolean;
};

/**
 * Returns boutique IDs for executive compare/employees APIs.
 * Uses SSOT: operational boutique only unless global=true (ADMIN/SUPER_ADMIN).
 */
export async function resolveExecutiveBoutiqueIds(
  userId: string,
  role: Role,
  globalParam: string | null,
  module: 'EXECUTIVE_COMPARE' | 'EXECUTIVE_EMPLOYEES',
  request: NextRequest | null,
  user: { id: string; role: string } | null
): Promise<ExecutiveScopeResult> {
  const result = await resolveBoutiqueIdsWithOptionalGlobal(request, user, module);
  if (!result.ok) {
    return { boutiqueIds: [], isGlobal: false };
  }
  return { boutiqueIds: result.scope.boutiqueIds, isGlobal: result.scope.global };
}
