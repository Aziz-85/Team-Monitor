/**
 * GET /api/admin/delegations?boutiqueId=...&status=active|scheduled|expired
 * POST /api/admin/delegations — create grant. Body: { boutiqueId, targetUserId, type, roleBoost?, flags?, startsAt, endsAt, reason }
 * RBAC: ADMIN any boutique; MANAGER only their boutique.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { writeDelegationAudit } from '@/lib/rbac/delegationAudit';
import type { Role } from '@prisma/client';
import type { DelegationGrantType } from '@prisma/client';

const MAX_DURATION_DAYS = 30;

function getClientIp(request: NextRequest): string | null {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    null
  );
}

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const role = user.role as Role;
  if (role !== 'ADMIN' && role !== 'MANAGER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const boutiqueIdParam = request.nextUrl.searchParams.get('boutiqueId')?.trim();
  const statusParam = request.nextUrl.searchParams.get('status')?.trim().toLowerCase();

  const effectiveBoutiqueId = (role === 'ADMIN' || (role as string) === 'SUPER_ADMIN') ? (boutiqueIdParam ?? user.boutiqueId ?? '') : (user.boutiqueId ?? '');
  if (!effectiveBoutiqueId) {
    return NextResponse.json({ error: 'Boutique required' }, { status: 400 });
  }

  if (role === 'MANAGER' && boutiqueIdParam && boutiqueIdParam !== user.boutiqueId) {
    return NextResponse.json({ error: 'Forbidden: only your boutique' }, { status: 403 });
  }

  const now = new Date();

  const grants = await prisma.delegationGrant.findMany({
    where: { boutiqueId: effectiveBoutiqueId },
    orderBy: [{ startsAt: 'desc' }, { createdAt: 'desc' }],
    include: {
      targetUser: { select: { id: true, empId: true, role: true, employee: { select: { name: true } } } },
      grantedByUser: { select: { id: true, empId: true, employee: { select: { name: true } } } },
      revokedByUser: { select: { id: true, empId: true, employee: { select: { name: true } } } },
    },
  });

  type GrantWithStatus = (typeof grants)[0] & {
    status: 'active' | 'scheduled' | 'expired';
  };

  const withStatus: GrantWithStatus[] = grants.map((g) => {
    let status: 'active' | 'scheduled' | 'expired' = 'expired';
    if (g.revokedAt) status = 'expired';
    else if (now >= g.startsAt && now <= g.endsAt) status = 'active';
    else if (now < g.startsAt) status = 'scheduled';
    return { ...g, status };
  });

  let filtered = withStatus;
  if (statusParam === 'active') filtered = withStatus.filter((g) => g.status === 'active');
  else if (statusParam === 'scheduled') filtered = withStatus.filter((g) => g.status === 'scheduled');
  else if (statusParam === 'expired') filtered = withStatus.filter((g) => g.status === 'expired');

  const items = filtered.map((g) => ({
    id: g.id,
    boutiqueId: g.boutiqueId,
    targetUserId: g.targetUserId,
    targetUser: g.targetUser,
    type: g.type,
    roleBoost: g.roleBoost,
    flags: g.flags,
    startsAt: g.startsAt.toISOString(),
    endsAt: g.endsAt.toISOString(),
    reason: g.reason,
    status: g.status,
    revokedAt: g.revokedAt?.toISOString() ?? null,
    revokedByUserId: g.revokedByUserId,
    revokeReason: g.revokeReason,
    createdAt: g.createdAt.toISOString(),
    grantedByUser: g.grantedByUser,
    revokedByUser: g.revokedByUser ? { id: g.revokedByUser.id, empId: g.revokedByUser.empId, name: g.revokedByUser.employee?.name } : null,
  }));

  return NextResponse.json({ grants: items });
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const role = user.role as Role;
  if (role !== 'ADMIN' && role !== 'MANAGER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: {
    boutiqueId?: string;
    targetUserId?: string;
    type?: string;
    roleBoost?: string;
    flags?: Record<string, boolean>;
    startsAt?: string;
    endsAt?: string;
    reason?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const boutiqueId = (body.boutiqueId ?? '').trim();
  const targetUserId = (body.targetUserId ?? '').trim();
  const type = (body.type ?? '').trim().toUpperCase();
  const reason = (body.reason ?? '').trim();
  const startsAtStr = body.startsAt;
  const endsAtStr = body.endsAt;

  if (!boutiqueId || !targetUserId || !reason) {
    return NextResponse.json(
      { error: 'boutiqueId, targetUserId, and reason are required' },
      { status: 400 }
    );
  }

  if (role === 'MANAGER' && user.boutiqueId !== boutiqueId) {
    return NextResponse.json({ error: 'Forbidden: only your boutique' }, { status: 403 });
  }

  if (targetUserId === user.id) {
    return NextResponse.json({ error: 'Cannot create a delegation grant for yourself' }, { status: 400 });
  }

  const grantType: DelegationGrantType | null =
    type === 'ROLE_BOOST' ? 'ROLE_BOOST' : type === 'PERMISSION_FLAGS' ? 'PERMISSION_FLAGS' : null;
  if (!grantType) {
    return NextResponse.json({ error: 'type must be ROLE_BOOST or PERMISSION_FLAGS' }, { status: 400 });
  }

  const now = new Date();
  const defaultEnd = new Date(now);
  defaultEnd.setDate(defaultEnd.getDate() + 7);
  const startsAt = startsAtStr ? new Date(startsAtStr) : now;
  const endsAt = endsAtStr ? new Date(endsAtStr) : defaultEnd;

  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    return NextResponse.json({ error: 'Invalid startsAt or endsAt' }, { status: 400 });
  }
  if (endsAt <= startsAt) {
    return NextResponse.json({ error: 'endsAt must be after startsAt' }, { status: 400 });
  }
  const durationDays = (endsAt.getTime() - startsAt.getTime()) / (24 * 60 * 60 * 1000);
  if (durationDays > MAX_DURATION_DAYS) {
    return NextResponse.json(
      { error: `Duration must not exceed ${MAX_DURATION_DAYS} days` },
      { status: 400 }
    );
  }

  let roleBoost: Role | null = null;
  let flags: Record<string, unknown> | null = null;

  if (grantType === 'ROLE_BOOST') {
    const r = (body.roleBoost ?? '').trim().toUpperCase();
    const allowed: Role[] = ['ASSISTANT_MANAGER', 'MANAGER'];
    if (!allowed.includes(r as Role)) {
      return NextResponse.json(
        { error: 'roleBoost must be ASSISTANT_MANAGER or MANAGER (ADMIN boost not allowed)' },
        { status: 400 }
      );
    }
    roleBoost = r as Role;
  } else {
    flags = body.flags && typeof body.flags === 'object' ? body.flags : {};
  }

  const [boutique, targetUser] = await Promise.all([
    prisma.boutique.findUnique({ where: { id: boutiqueId }, select: { id: true } }),
    prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, role: true, boutiqueId: true },
    }),
  ]);

  if (!boutique) return NextResponse.json({ error: 'Boutique not found' }, { status: 404 });
  if (!targetUser) return NextResponse.json({ error: 'Target user not found' }, { status: 404 });

  const grant = await prisma.delegationGrant.create({
    data: {
      boutiqueId,
      targetUserId,
      grantedByUserId: user.id,
      type: grantType,
      roleBoost,
      flags: flags != null ? (flags as import('@prisma/client').Prisma.InputJsonValue) : undefined,
      startsAt,
      endsAt,
      reason,
    },
  });

  await writeDelegationAudit({
    boutiqueId,
    actorUserId: user.id,
    targetUserId,
    action: 'GRANT_CREATE',
    metadata: {
      grantId: grant.id,
      type: grantType,
      roleBoost: roleBoost ?? undefined,
      flags: flags ?? undefined,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      reason,
    },
    ip: getClientIp(request),
    userAgent: request.headers.get('user-agent') ?? undefined,
  });

  return NextResponse.json({
    id: grant.id,
    boutiqueId: grant.boutiqueId,
    targetUserId: grant.targetUserId,
    type: grant.type,
    roleBoost: grant.roleBoost,
    flags: grant.flags,
    startsAt: grant.startsAt.toISOString(),
    endsAt: grant.endsAt.toISOString(),
    reason: grant.reason,
  });
}
