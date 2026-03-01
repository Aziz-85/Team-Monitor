/**
 * SCOPE SSOT — Single Source of Truth for Boutique Scope
 * ======================================================
 *
 * RULES:
 * 1. Default: ALWAYS single operational boutique (session boutique, or ?b= for SUPER_ADMIN).
 * 2. Multi-boutique: ONLY when request has global=true AND role in (ADMIN, SUPER_ADMIN) AND allowGlobal=true.
 * 3. NEVER silently read stored scope preference (UserPreference.scopeJson) for pages that do not show multi-boutique mode.
 * 4. If a route needs stored preference (rare, e.g. /api/me/scope), use mode=storedScope explicitly and ensure UI shows it.
 * 5. EMPLOYEE/ASSISTANT_MANAGER: always single boutique (Employee.boutiqueId); global ignored.
 *
 * When global is allowed:
 * - Only for routes that explicitly pass allowGlobal: true and have UI toggle for "View all boutiques".
 * - Executive compare/employees endpoints support ?global=true for ADMIN.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getOperationalScope } from '@/lib/scope/operationalScope';
import { getStoredScopePreference, resolveScope } from '@/lib/scope/resolveScope';
import { getEmployeeBoutiqueIdForUser } from '@/lib/boutique/resolveOperationalBoutique';
import type { Role } from '@prisma/client';

export type SsotScopeResult = {
  boutiqueIds: string[];
  boutiqueId: string;
  label: string;
  isGlobal: boolean;
  scopeUsed: { boutiqueIds: string[]; global: boolean };
};

const GLOBAL_ALLOWED_ROLES: Role[] = ['ADMIN', 'SUPER_ADMIN'];

type UserLike = { id: string; role: string; boutiqueId?: string | null; boutique?: { name: string; code: string } | null };

function resolveOperationalBoutiqueOnlyInternal(
  request: NextRequest | null,
  user: UserLike | null
): Promise<
  | { ok: true; scope: { boutiqueId: string; boutiqueIds: string[]; label: string } }
  | { ok: false; res: NextResponse }
> {
  if (!user?.id) {
    return Promise.resolve({ ok: false, res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) });
  }
  const role = user.role as Role;
  if (role === 'EMPLOYEE' || role === 'ASSISTANT_MANAGER') {
    return getEmployeeBoutiqueIdForUser(user.id).then((empBoutiqueId) => {
      const boutiqueId = empBoutiqueId ?? user.boutiqueId ?? '';
      if (!boutiqueId) {
        return { ok: false as const, res: NextResponse.json({ error: 'Operational boutique required' }, { status: 403 }) };
      }
      const b = user.boutique;
      const label = b ? `${b.name} (${b.code})` : boutiqueId;
      return { ok: true as const, scope: { boutiqueId, boutiqueIds: [boutiqueId], label } };
    });
  }
  return getOperationalScope(request ?? undefined).then((opScope) => {
    if (!opScope?.boutiqueId) {
      return { ok: false as const, res: NextResponse.json({ error: 'Operational boutique required' }, { status: 403 }) };
    }
    return { ok: true as const, scope: { boutiqueId: opScope.boutiqueId, boutiqueIds: [opScope.boutiqueId], label: opScope.label } };
  });
}

/**
 * Resolve operational boutique only. No fallback to stored scope.
 * Returns { ok, scope } or 403. Use for executive routes that need scope.boutiqueIds.
 */
export async function resolveOperationalBoutiqueOnly(
  request: NextRequest | null,
  user: UserLike | null
): Promise<
  | { ok: true; scope: { boutiqueId: string; boutiqueIds: string[]; label: string } }
  | { ok: false; res: NextResponse }
> {
  return resolveOperationalBoutiqueOnlyInternal(request, user);
}

/**
 * Resolve boutique IDs with optional global mode (scope shape for lib/executive/scope).
 * If global=true AND role in (ADMIN, SUPER_ADMIN): returns all active boutiques.
 * Else: operational single boutique only.
 */
export async function resolveBoutiqueIdsWithOptionalGlobal(
  request: NextRequest | null,
  user: UserLike | null,
  modeName: string
): Promise<
  | { ok: true; scope: { boutiqueIds: string[]; global: boolean; scopeUsed: { boutiqueIds: string[]; global: boolean } } }
  | { ok: false; res: NextResponse }
> {
  const result = await resolveBoutiqueIdsOptionalGlobal(request, user, { allowGlobal: true, modeName });
  if (!result.ok) return result;
  return {
    ok: true,
    scope: {
      boutiqueIds: result.boutiqueIds,
      global: result.global,
      scopeUsed: { boutiqueIds: result.boutiqueIds, global: result.global },
    },
  };
}

/**
 * Require operational boutique only. No fallback to stored scope.
 * Returns { boutiqueId, boutiqueIds, role, userId } or 403.
 */
export async function requireOperationalBoutiqueOnly(
  request: NextRequest | null,
  user: UserLike | null
): Promise<
  | { ok: true; boutiqueId: string; boutiqueIds: string[]; role: Role; userId: string; label: string }
  | { ok: false; res: NextResponse }
> {
  const result = await resolveOperationalBoutiqueOnlyInternal(request, user);
  if (!result.ok) return result;
  return {
    ok: true,
    boutiqueId: result.scope.boutiqueId,
    boutiqueIds: result.scope.boutiqueIds,
    role: user!.role as Role,
    userId: user!.id,
    label: result.scope.label,
  };
}

/**
 * Resolve boutique IDs with optional global mode.
 * If allowGlobal && global=true && role in (ADMIN, SUPER_ADMIN): returns multiple boutiques.
 * Else: operational single boutique only.
 */
export async function resolveBoutiqueIdsOptionalGlobal(
  request: NextRequest | null,
  user: UserLike | null,
  options: { allowGlobal?: boolean; modeName?: string } = {}
): Promise<
  | { ok: true; boutiqueIds: string[]; global: boolean }
  | { ok: false; res: NextResponse }
> {
  if (!options.allowGlobal) {
    const result = await resolveOperationalBoutiqueOnlyInternal(request, user);
    if (!result.ok) return result;
    return { ok: true, boutiqueIds: result.scope.boutiqueIds, global: false };
  }
  if (!user?.id) {
    return { ok: false, res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const globalParam = request ? request.nextUrl.searchParams.get('global') === 'true' : false;
  if (globalParam && GLOBAL_ALLOWED_ROLES.includes(user.role as Role)) {
    const all = await prisma.boutique.findMany({
      where: { isActive: true },
      select: { id: true },
      orderBy: { code: 'asc' },
    });
    const boutiqueIds = all.map((b) => b.id);
    if (boutiqueIds.length > 0) {
      const { writeAdminAudit } = await import('@/lib/admin/audit');
      await writeAdminAudit({
        actorUserId: user.id,
        action: 'EXECUTIVE_GLOBAL_VIEW_ACCESSED',
        entityType: options.modeName ?? 'default',
        entityId: null,
        afterJson: JSON.stringify({ modeName: options.modeName, actorId: user.id, timestamp: new Date().toISOString() }),
        boutiqueId: boutiqueIds[0] ?? undefined,
      });
      return { ok: true, boutiqueIds, global: true };
    }
  }
  const result = await resolveOperationalBoutiqueOnlyInternal(request, user);
  if (!result.ok) return result;
  return { ok: true, boutiqueIds: result.scope.boutiqueIds, global: false };
}

/**
 * Resolve operational boutique ID or throw. Single boutique only.
 * Use for routes that MUST have exactly one boutique (sales write, inventory, leaves, schedule).
 */
export async function resolveOperationalBoutiqueIdOrThrow(
  request?: NextRequest | null
): Promise<{ boutiqueId: string; boutiqueLabel: string }> {
  const scope = await getOperationalScope(request);
  if (!scope?.boutiqueId) {
    throw new Error('Account not assigned to a boutique');
  }
  return { boutiqueId: scope.boutiqueId, boutiqueLabel: scope.label };
}

/**
 * Resolve boutique IDs for a request. The canonical scope resolver for all APIs.
 *
 * @param request - NextRequest (for ?global=, ?b=, ?mode=)
 * @param options.allowGlobal - If true and role allows, ?global=true returns all active boutiques
 * @param options.modeName - For logging/audit
 * @returns boutiqueIds (length 1 by default, or multiple only when global=true and allowed)
 */
export async function resolveBoutiqueIdsForRequest(
  request: NextRequest | null,
  options: { allowGlobal?: boolean; modeName?: string } = {}
): Promise<SsotScopeResult | null> {
  const { allowGlobal = false, modeName = 'default' } = options;
  const user = await getSessionUser();
  if (!user?.id) return null;

  const role = user.role as Role;

  // EMPLOYEE / ASSISTANT_MANAGER: always single boutique from Employee.boutiqueId
  if (role === 'EMPLOYEE' || role === 'ASSISTANT_MANAGER') {
    const empBoutiqueId = await getEmployeeBoutiqueIdForUser(user.id);
    const boutiqueId = empBoutiqueId ?? (user as { boutiqueId?: string }).boutiqueId ?? '';
    if (!boutiqueId) return null;
    const b = (user as { boutique?: { name: string; code: string } }).boutique;
    const label = b ? `${b.name} (${b.code})` : boutiqueId;
    return {
      boutiqueIds: [boutiqueId],
      boutiqueId,
      label,
      isGlobal: false,
      scopeUsed: { boutiqueIds: [boutiqueId], global: false },
    };
  }

  // mode=storedScope: use stored preference (ONLY for explicit scope selector API / pages with visible toggle)
  const modeParam = request ? request.nextUrl.searchParams.get('mode') : null;
  if (request && modeParam === 'storedScope') {
    const stored = await getStoredScopePreference(user.id);
    if (stored) {
      const resolved = await resolveScope(user.id, role, stored);
      if (resolved.boutiqueIds.length > 0) {
        return {
          boutiqueIds: resolved.boutiqueIds,
          boutiqueId: resolved.boutiqueId,
          label: resolved.label,
          isGlobal: resolved.boutiqueIds.length > 1,
          scopeUsed: { boutiqueIds: resolved.boutiqueIds, global: resolved.boutiqueIds.length > 1 },
        };
      }
    }
    // Fall through to operational if stored yields nothing
  }

  // global=true: only when allowGlobal AND role allows
  const globalParam = request ? request.nextUrl.searchParams.get('global') === 'true' : false;
  if (allowGlobal && globalParam && GLOBAL_ALLOWED_ROLES.includes(role)) {
    const all = await prisma.boutique.findMany({
      where: { isActive: true },
      select: { id: true },
      orderBy: { code: 'asc' },
    });
    const boutiqueIds = all.map((b) => b.id);
    if (boutiqueIds.length > 0) {
      const { writeAdminAudit } = await import('@/lib/admin/audit');
      await writeAdminAudit({
        actorUserId: user.id,
        action: 'EXECUTIVE_GLOBAL_VIEW_ACCESSED',
        entityType: modeName,
        entityId: null,
        afterJson: JSON.stringify({ modeName, actorId: user.id, timestamp: new Date().toISOString() }),
        boutiqueId: boutiqueIds[0] ?? undefined,
      });
      const label = `${boutiqueIds.length} boutiques`;
      return {
        boutiqueIds,
        boutiqueId: boutiqueIds[0] ?? '',
        label,
        isGlobal: true,
        scopeUsed: { boutiqueIds, global: true },
      };
    }
  }

  // Default: single operational boutique (session or ?b= for SUPER_ADMIN)
  const opScope = await getOperationalScope(request ?? undefined);
  if (!opScope?.boutiqueId) return null;

  return {
    boutiqueIds: [opScope.boutiqueId],
    boutiqueId: opScope.boutiqueId,
    label: opScope.label,
    isGlobal: false,
    scopeUsed: { boutiqueIds: [opScope.boutiqueId], global: false },
  };
}

/**
 * Require single-boutique scope. Returns error response if not authenticated or no boutique.
 * Use for routes that must NEVER return multi-boutique data (allowGlobal=false).
 */
export async function requireBoutiqueScope(
  request: NextRequest | null,
  options: { allowGlobal?: boolean; modeName?: string } = {}
): Promise<
  | { ok: true; scope: SsotScopeResult; res: null }
  | { ok: false; res: NextResponse }
> {
  const scope = await resolveBoutiqueIdsForRequest(request, options);
  if (!scope) {
    return { ok: false, res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  if (scope.boutiqueIds.length === 0) {
    return {
      ok: false,
      res: NextResponse.json(
        { error: 'No boutiques in scope' },
        { status: 403 }
      ),
    };
  }
  // Safety: when allowGlobal=false, assert single boutique
  if (!options.allowGlobal && scope.boutiqueIds.length > 1) {
    console.warn(`[SSOT] Route ${options.modeName ?? 'unknown'} expected single boutique but got ${scope.boutiqueIds.length}`);
    // Return first only to prevent data bleed; do not leak multi-boutique
    return {
      ok: true,
      scope: {
        ...scope,
        boutiqueIds: [scope.boutiqueId],
        scopeUsed: { boutiqueIds: [scope.boutiqueId], global: false },
      },
      res: null,
    };
  }
  return { ok: true, scope, res: null };
}

