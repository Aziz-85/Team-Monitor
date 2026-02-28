/**
 * Operational boutique scope for schedule APIs.
 * Server-side only: SINGLE boutique from resolveOperationalBoutiqueId.
 * NEVER trust client-provided boutiqueId for filtering.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getOperationalScope } from '@/lib/scope/operationalScope';
import type { Role } from '@prisma/client';

export type ScheduleScopeResult = {
  userId: string;
  role: Role;
  empId: string | null;
  boutiqueId: string;
  boutiqueIds: string[];
  label: string;
};

/**
 * Get current user and resolved operational scope for schedule (single boutique only).
 * Pass request in API route handlers so SUPER_ADMIN can use ?b= context.
 */
export async function getScheduleScope(request?: NextRequest | null): Promise<ScheduleScopeResult | null> {
  const scope = await getOperationalScope(request);
  if (!scope) return null;
  const boutiqueId = scope.boutiqueId;
  return {
    userId: scope.userId,
    role: scope.role,
    empId: scope.empId,
    boutiqueId,
    boutiqueIds: boutiqueId ? [boutiqueId] : [],
    label: scope.label,
  };
}

export type RequireScheduleScopeResult =
  | { scope: ScheduleScopeResult; res: null }
  | { scope: null; res: NextResponse };

/**
 * Require schedule scope; returns 401/403 if not authenticated or no scope.
 */
export async function requireScheduleScope(request?: NextRequest | null): Promise<RequireScheduleScopeResult> {
  const scope = await getScheduleScope(request);
  if (!scope) {
    return { scope: null, res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  if (!scope.boutiqueId || scope.boutiqueIds.length === 0) {
    return {
      scope: null,
      res: NextResponse.json(
        { error: 'No boutique scope available for schedule. Select a boutique in the scope selector.' },
        { status: 403 }
      ),
    };
  }
  return { scope, res: null };
}
