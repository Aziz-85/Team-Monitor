/**
 * Effective RBAC — baseline role/permissions + active delegation grants (time-bounded overlay).
 * Do not change baseline behavior when no grants exist.
 * Asia/Riyadh: "now" for grant validity uses server time (DB stores UTC; comparison is correct).
 */

import { prisma } from '@/lib/db';
import { canEditSchedule, canApproveWeek } from '@/lib/permissions';
import type { Role } from '@prisma/client';

const ROLE_ORDER: Role[] = ['EMPLOYEE', 'ASSISTANT_MANAGER', 'MANAGER', 'ADMIN', 'SUPER_ADMIN'];
function roleLevel(r: Role): number {
  const i = ROLE_ORDER.indexOf(r);
  return i >= 0 ? i : -1;
}
function maxRole(a: Role, b: Role): Role {
  return roleLevel(a) >= roleLevel(b) ? a : b;
}

export type EffectiveFlags = {
  canEditSchedule: boolean;
  canApproveWeek: boolean;
  canApproveLeaveRequests?: boolean;
  canApproveRequests?: boolean;
};

export type EffectiveAccessResult = {
  effectiveRole: Role;
  effectiveFlags: EffectiveFlags;
  baselineRole: Role;
  /** Active grant IDs that contributed (for debugging/audit) */
  activeGrantIds: string[];
};

export type UserLike = { id: string; role: Role; canEditSchedule?: boolean };

/**
 * Get baseline flags from current system (role + optional DB canEditSchedule).
 */
function baselineFlags(user: UserLike): EffectiveFlags {
  const role = user.role;
  const canEdit = user.canEditSchedule ?? canEditSchedule(role);
  const canApprove = canApproveWeek(role);
  const canApproveLeave = role === 'MANAGER' || role === 'ADMIN' || role === 'SUPER_ADMIN';
  const canApproveReq = role === 'MANAGER' || role === 'ADMIN' || role === 'SUPER_ADMIN';
  return {
    canEditSchedule: canEdit,
    canApproveWeek: canApprove,
    canApproveLeaveRequests: canApproveLeave,
    canApproveRequests: canApproveReq,
  };
}

/**
 * Merge flags: baseline merged with grant flags (true wins).
 */
function mergeFlags(
  baseline: EffectiveFlags,
  grantFlags: Record<string, unknown> | null
): EffectiveFlags {
  if (!grantFlags || typeof grantFlags !== 'object') return baseline;
  const out = { ...baseline };
  if (grantFlags.canApproveLeaveRequests === true) out.canApproveLeaveRequests = true;
  if (grantFlags.canApproveRequests === true) out.canApproveRequests = true;
  if (grantFlags.canEditSchedule === true) out.canEditSchedule = true;
  if (grantFlags.canApproveWeek === true) out.canApproveWeek = true;
  return out;
}

/**
 * Resolve effective role and flags for a user in a boutique context.
 * Active grant = revokedAt is null AND now in [startsAt, endsAt].
 * ROLE_BOOST: effectiveRole = max(baselineRole, roleBoost).
 * PERMISSION_FLAGS: effectiveFlags = baseline merged with grant flags (true wins).
 */
export async function getEffectiveAccess(
  user: UserLike,
  boutiqueId: string
): Promise<EffectiveAccessResult> {
  const now = new Date();
  const baselineRole = user.role;
  let effectiveRole = baselineRole;
  let effectiveFlags = baselineFlags(user);
  const activeGrantIds: string[] = [];

  const grants = await prisma.delegationGrant.findMany({
    where: {
      targetUserId: user.id,
      boutiqueId,
      revokedAt: null,
      startsAt: { lte: now },
      endsAt: { gte: now },
    },
    select: {
      id: true,
      type: true,
      roleBoost: true,
      flags: true,
    },
  });

  for (const g of grants) {
    activeGrantIds.push(g.id);
    if (g.type === 'ROLE_BOOST' && g.roleBoost) {
      effectiveRole = maxRole(effectiveRole, g.roleBoost);
    }
    if (g.type === 'PERMISSION_FLAGS' && g.flags) {
      effectiveFlags = mergeFlags(
        effectiveFlags,
        g.flags as Record<string, unknown>
      );
    }
  }

  // After merging all grants, re-apply role-derived defaults so that a boosted role
  // also implies standard flags for that role (e.g. MANAGER => canApproveWeek).
  if (effectiveRole !== baselineRole) {
    effectiveFlags = {
      ...effectiveFlags,
      canEditSchedule: effectiveFlags.canEditSchedule || canEditSchedule(effectiveRole),
      canApproveWeek: effectiveFlags.canApproveWeek || canApproveWeek(effectiveRole),
      canApproveLeaveRequests: effectiveFlags.canApproveLeaveRequests ?? (effectiveRole === 'MANAGER' || effectiveRole === 'ADMIN' || effectiveRole === 'SUPER_ADMIN'),
      canApproveRequests: effectiveFlags.canApproveRequests ?? (effectiveRole === 'MANAGER' || effectiveRole === 'ADMIN' || effectiveRole === 'SUPER_ADMIN'),
    };
  }

  return {
    effectiveRole,
    effectiveFlags,
    baselineRole,
    activeGrantIds,
  };
}

/**
 * Require that the session user has one of the given roles in the given boutique (effective).
 * Returns the session user and effective access, or throws / returns error response.
 */
export async function requireEffectiveRole(
  getSession: () => Promise<{ id: string; role: Role; canEditSchedule?: boolean } | null>,
  allowedRoles: Role[],
  boutiqueId: string
): Promise<
  | { user: UserLike; access: EffectiveAccessResult; res: null }
  | { user: null; access: null; res: import('next/server').NextResponse }
> {
  const NextResponse = (await import('next/server')).NextResponse;
  const user = await getSession();
  if (!user) {
    return { user: null, access: null, res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const access = await getEffectiveAccess(user, boutiqueId);
  if (!allowedRoles.includes(access.effectiveRole)) {
    return { user: null, access: null, res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { user, access, res: null };
}
