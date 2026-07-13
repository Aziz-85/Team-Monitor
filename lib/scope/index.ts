/**
 * Unified read/write scope facade.
 *
 * Request boutique IDs are validated against server-derived scope. They never
 * expand a user's authority.
 */

import type { NextRequest } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/auth/index';
import { requireBoutiqueAccess } from '@/lib/permissions/boutiqueAccess';
import {
  requireBoutiqueScope,
  resolveBoutiqueIdsForRequest,
  type SsotScopeResult,
} from '@/lib/scope/ssot';

export {
  requireBoutiqueScope,
  resolveBoutiqueIdsForRequest,
  resolveOperationalBoutiqueIdOrThrow,
  type SsotScopeResult,
} from '@/lib/scope/ssot';

export type ResolvedWriteScope = {
  boutiqueId: string;
  userId: string;
};

/** Resolve server-derived scope for reads; global mode must be explicit. */
export async function resolveReadScope(
  request: NextRequest | null,
  options: { allowGlobal?: boolean; modeName?: string } = {}
): Promise<SsotScopeResult | null> {
  return resolveBoutiqueIdsForRequest(request, options);
}

/**
 * Resolve exactly one boutique for a write and validate any request identifier.
 * A client boutique mismatch is rejected rather than used as authority.
 */
export async function resolveWriteScope(
  request: NextRequest | null,
  requestedBoutiqueId?: string | null,
  modeName = 'write'
): Promise<ResolvedWriteScope> {
  const user = await requireAuthenticatedUser();
  const result = await requireBoutiqueScope(request, {
    allowGlobal: false,
    modeName,
  });
  if (!result.ok) {
    throw new Error(result.res.status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN');
  }

  const trustedBoutiqueId = result.scope.boutiqueId;
  const requested = requestedBoutiqueId?.trim();
  if (requested && requested !== trustedBoutiqueId) {
    throw new Error('FORBIDDEN');
  }

  await requireBoutiqueAccess(user, trustedBoutiqueId);
  return { boutiqueId: trustedBoutiqueId, userId: user.id };
}
