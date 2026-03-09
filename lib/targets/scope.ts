/**
 * Target Management module scope and RBAC.
 * - SUPER_ADMIN / ADMIN: full access within allowed boutiques.
 * - MANAGER: access only within operational boutique.
 * - ASSISTANT_MANAGER: view only (no edit/import).
 * - AREA_MANAGER: view, edit, import within assigned boutiques only (allowedBoutiqueIds from UserBoutiqueMembership).
 * - EMPLOYEE / VIEWER: no target module access.
 *
 * AREA_MANAGER explicit requirements:
 * - Can open /targets, /targets/boutiques, /targets/employees, /targets/import.
 * - Can download templates, preview imports, apply imports.
 * - Can edit boutique and employee targets (via API and import) within scope only.
 * - Can only see and modify boutiques inside allowedBoutiqueIds (no unrestricted admin powers).
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getOperationalScope } from '@/lib/scope/operationalScope';
import type { Role } from '@prisma/client';

export type TargetsScopeResult = {
  userId: string;
  role: Role;
  allowedBoutiqueIds: string[];
  canView: boolean;
  canEdit: boolean;
  canImport: boolean;
};

const ROLES_VIEW: Role[] = ['MANAGER', 'ADMIN', 'SUPER_ADMIN', 'ASSISTANT_MANAGER', 'AREA_MANAGER'];
const ROLES_EDIT: Role[] = ['MANAGER', 'ADMIN', 'SUPER_ADMIN', 'AREA_MANAGER'];
const ROLES_IMPORT: Role[] = ['MANAGER', 'ADMIN', 'SUPER_ADMIN', 'AREA_MANAGER'];

/**
 * Get target module scope. For MANAGER/ADMIN/AREA_MANAGER uses operational scope (single or multi-boutique);
 * for SUPER_ADMIN returns all active boutiques (so list/filter can show any).
 */
export async function getTargetsScope(
  request?: NextRequest | null
): Promise<{ scope: TargetsScopeResult; res: null } | { scope: null; res: NextResponse }> {
  const user = await getSessionUser();
  if (!user?.id) {
    return { scope: null, res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const role = user.role as Role;
  if (!ROLES_VIEW.includes(role)) {
    return { scope: null, res: NextResponse.json({ error: 'Forbidden: Target module access required' }, { status: 403 }) };
  }

  let allowedBoutiqueIds: string[];
  if (role === 'SUPER_ADMIN') {
    const boutiques = await prisma.boutique.findMany({
      where: { isActive: true },
      select: { id: true },
    });
    allowedBoutiqueIds = boutiques.map((b) => b.id);
  } else {
    const op = await getOperationalScope(request ?? undefined);
    allowedBoutiqueIds = op?.boutiqueIds ?? (user.boutiqueId ? [user.boutiqueId] : []);
  }

  const canView = ROLES_VIEW.includes(role);
  const canEdit = ROLES_EDIT.includes(role) && allowedBoutiqueIds.length > 0;
  const canImport = ROLES_IMPORT.includes(role) && allowedBoutiqueIds.length > 0;

  return {
    scope: {
      userId: user.id,
      role,
      allowedBoutiqueIds,
      canView,
      canEdit,
      canImport,
    },
    res: null,
  };
}

/** Require view access; return 403 if not allowed. */
export async function requireTargetsView(
  request?: NextRequest | null
): Promise<{ scope: TargetsScopeResult; res: null } | { scope: null; res: NextResponse }> {
  const out = await getTargetsScope(request);
  if (out.res) return out;
  if (!out.scope.canView) {
    return { scope: null, res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return out;
}

/** Require edit access (create/update/delete). */
export async function requireTargetsEdit(
  request?: NextRequest | null
): Promise<{ scope: TargetsScopeResult; res: null } | { scope: null; res: NextResponse }> {
  const out = await getTargetsScope(request);
  if (out.res) return out;
  if (!out.scope.canEdit) {
    return { scope: null, res: NextResponse.json({ error: 'Forbidden: Edit not allowed' }, { status: 403 }) };
  }
  return out;
}

/** Require import access. */
export async function requireTargetsImport(
  request?: NextRequest | null
): Promise<{ scope: TargetsScopeResult; res: null } | { scope: null; res: NextResponse }> {
  const out = await getTargetsScope(request);
  if (out.res) return out;
  if (!out.scope.canImport) {
    return { scope: null, res: NextResponse.json({ error: 'Forbidden: Import not allowed' }, { status: 403 }) };
  }
  return out;
}
