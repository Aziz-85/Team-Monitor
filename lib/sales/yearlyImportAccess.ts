/**
 * Shared auth + operational boutique scope for yearly employee sales import APIs.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import type { Role } from '@prisma/client';
import { requireRole, getSessionUser } from '@/lib/auth';
import { requireOperationalBoutique } from '@/lib/scope/requireOperationalBoutique';
import { getTrustedOperationalBoutiqueId } from '@/lib/scope/operationalScope';
import { canManageSalesInBoutique } from '@/lib/membershipPermissions';

export const YEARLY_SALES_IMPORT_ROLES = ['ADMIN', 'SUPER_ADMIN', 'MANAGER', 'AREA_MANAGER'] as const;

export type YearlySalesImportScope = {
  user: NonNullable<Awaited<ReturnType<typeof getSessionUser>>>;
  boutiqueId: string;
};

export async function requireYearlySalesImport(
  request: NextRequest
): Promise<{ scope: YearlySalesImportScope } | { res: NextResponse }> {
  let user: Awaited<ReturnType<typeof getSessionUser>>;
  try {
    user = await requireRole([...YEARLY_SALES_IMPORT_ROLES]);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') {
      return { res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
    }
    return { res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  const scopeResult = await requireOperationalBoutique(request);
  if (!scopeResult.ok) {
    return { res: scopeResult.res };
  }
  const { boutiqueId } = scopeResult;

  const trustedId = await getTrustedOperationalBoutiqueId(user, request);
  if (!trustedId || boutiqueId !== trustedId) {
    return { res: NextResponse.json({ error: 'Boutique not in your operational scope' }, { status: 403 }) };
  }

  const canManage = await canManageSalesInBoutique(user.id, user.role as Role, boutiqueId, trustedId);
  if (!canManage) {
    return {
      res: NextResponse.json(
        { error: 'You do not have permission to manage sales for this boutique' },
        { status: 403 }
      ),
    };
  }

  return { scope: { user, boutiqueId } };
}
