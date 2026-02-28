/**
 * OPERATIONAL SCOPE — Session-bound boutique only (no switching)
 * -----------------------------------------------------------------
 * Scope is user.boutiqueId from session. SUPER_ADMIN may override per-request via ?b= or X-Boutique-Code
 * when request is provided (API only); validated by UserBoutiqueMembership.canAccess. No persistence.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { resolveEffectiveBoutiqueId } from '@/lib/scope/scopeContext';
import type { Role } from '@prisma/client';

export type OperationalScopeResult = {
  userId: string;
  role: Role;
  empId: string | null;
  boutiqueId: string;
  boutiqueIds: string[];
  label: string;
};

/**
 * Get operational scope from session. When request is provided and user is SUPER_ADMIN,
 * effective boutique may come from ?b= or X-Boutique-Code (validated by membership). Otherwise session boutiqueId.
 */
export async function getOperationalScope(request?: NextRequest | null): Promise<OperationalScopeResult | null> {
  const user = await getSessionUser();
  if (!user?.id) return null;
  const role = user.role as Role;

  let boutiqueId: string;
  if (role === 'SUPER_ADMIN' && request) {
    const resolved = await resolveEffectiveBoutiqueId(
      { id: user.id, role: user.role, boutiqueId: user.boutiqueId },
      request,
      prisma
    );
    boutiqueId = resolved.boutiqueId;
  } else {
    boutiqueId = user.boutiqueId ?? '';
  }

  if (!boutiqueId) return null;

  const boutique = await prisma.boutique.findUnique({
    where: { id: boutiqueId },
    select: { id: true, name: true, code: true },
  });
  const label = boutique ? `${boutique.name} (${boutique.code})` : boutiqueId;

  return {
    userId: user.id,
    role,
    empId: user.empId ?? null,
    boutiqueId,
    boutiqueIds: [boutiqueId],
    label,
  };
}

export type RequireOperationalScopeResult =
  | { scope: OperationalScopeResult; res: null }
  | { scope: null; res: NextResponse };

/**
 * Require operational scope (session boutique, or per-request context for SUPER_ADMIN when request passed). 401 if not authenticated, 403 if no boutique.
 */
export async function requireOperationalScope(request?: NextRequest | null): Promise<RequireOperationalScopeResult> {
  const scope = await getOperationalScope(request);
  if (!scope) {
    return { scope: null, res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  if (!scope.boutiqueId) {
    return {
      scope: null,
      res: NextResponse.json(
        { error: 'Account not assigned to a boutique' },
        { status: 403 }
      ),
    };
  }
  return { scope, res: null };
}
