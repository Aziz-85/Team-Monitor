/**
 * Executive module access — align with dashboard layout + drilldown nav (effective role / delegation).
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import type { Role } from '@prisma/client';
import { getSessionUser, type SessionUser } from '@/lib/auth';
import { getOperationalScope } from '@/lib/scope/operationalScope';
import { getEffectiveAccess } from '@/lib/rbac/effectiveAccess';
import { resolveOperationalBoutiqueOnly } from '@/lib/scope/ssot';

export const EXECUTIVE_VIEW_ROLES: Role[] = [
  'MANAGER',
  'ADMIN',
  'SUPER_ADMIN',
  'AREA_MANAGER',
  'DEMO_VIEWER',
];

export type ExecutivePageGate =
  | { ok: true; user: SessionUser }
  | { ok: false; redirect: 'login' | 'dashboard' };

/** Server Components under /executive (no Request — matches dashboard layout scope). */
export async function gateExecutivePage(): Promise<ExecutivePageGate> {
  const user = await getSessionUser();
  if (!user) return { ok: false, redirect: 'login' };

  if (user.role === 'SUPER_ADMIN' || user.role === 'DEMO_VIEWER') {
    if (EXECUTIVE_VIEW_ROLES.includes(user.role)) return { ok: true, user };
    return { ok: false, redirect: 'dashboard' };
  }

  const scope = await getOperationalScope();
  const boutiqueId = scope?.boutiqueId ?? user.boutiqueId ?? '';
  if (!boutiqueId) return { ok: false, redirect: 'dashboard' };

  const access = await getEffectiveAccess(
    { id: user.id, role: user.role, canEditSchedule: user.canEditSchedule },
    boutiqueId
  );
  if (!EXECUTIVE_VIEW_ROLES.includes(access.effectiveRole)) {
    return { ok: false, redirect: 'dashboard' };
  }
  return { ok: true, user };
}

type ExecApiScope = { boutiqueId: string; boutiqueIds: string[]; label: string };

/**
 * Route handlers: operational boutique + effective role (delegation-safe). Single resolveOperationalBoutiqueOnly.
 */
export async function requireExecutiveApiViewer(
  request: NextRequest,
  user: SessionUser
): Promise<
  { ok: true; scope: ExecApiScope; effectiveRole: Role } | { ok: false; res: NextResponse }
> {
  if (user.role === 'SUPER_ADMIN' || user.role === 'DEMO_VIEWER') {
    if (!EXECUTIVE_VIEW_ROLES.includes(user.role)) {
      return { ok: false, res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
    }
    const scopeResult = await resolveOperationalBoutiqueOnly(request, user);
    if (!scopeResult.ok) return { ok: false, res: scopeResult.res };
    return { ok: true, scope: scopeResult.scope, effectiveRole: user.role };
  }

  const scopeResult = await resolveOperationalBoutiqueOnly(request, user);
  if (!scopeResult.ok) return { ok: false, res: scopeResult.res };

  const access = await getEffectiveAccess(
    { id: user.id, role: user.role, canEditSchedule: user.canEditSchedule },
    scopeResult.scope.boutiqueId
  );
  if (!EXECUTIVE_VIEW_ROLES.includes(access.effectiveRole)) {
    return { ok: false, res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { ok: true, scope: scopeResult.scope, effectiveRole: access.effectiveRole };
}
