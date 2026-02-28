/**
 * POST /api/admin/delegations/:id/revoke
 * Body: { reason }
 * RBAC: ADMIN any; MANAGER only their boutique.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { writeDelegationAudit } from '@/lib/rbac/delegationAudit';
import type { Role } from '@prisma/client';

function getClientIp(request: NextRequest): string | null {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    null
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const role = user.role as Role;
  if (role !== 'ADMIN' && role !== 'MANAGER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const id = (await params).id?.trim();
  if (!id) return NextResponse.json({ error: 'Grant id required' }, { status: 400 });

  let body: { reason?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const reason = (body.reason ?? '').trim();
  if (!reason) {
    return NextResponse.json({ error: 'reason is required' }, { status: 400 });
  }

  const grant = await prisma.delegationGrant.findUnique({
    where: { id },
    select: { id: true, boutiqueId: true, targetUserId: true, revokedAt: true },
  });

  if (!grant) return NextResponse.json({ error: 'Grant not found' }, { status: 404 });
  if (grant.revokedAt) {
    return NextResponse.json({ error: 'Grant already revoked' }, { status: 400 });
  }

  if (role === 'MANAGER' && grant.boutiqueId !== user.boutiqueId) {
    return NextResponse.json({ error: 'Forbidden: only your boutique' }, { status: 403 });
  }

  const now = new Date();
  await prisma.delegationGrant.update({
    where: { id },
    data: {
      revokedAt: now,
      revokedByUserId: user.id,
      revokeReason: reason,
    },
  });

  await writeDelegationAudit({
    boutiqueId: grant.boutiqueId,
    actorUserId: user.id,
    targetUserId: grant.targetUserId,
    action: 'GRANT_REVOKE',
    metadata: { grantId: id, reason },
    ip: getClientIp(request),
    userAgent: request.headers.get('user-agent') ?? undefined,
  });

  return NextResponse.json({ id, revokedAt: now.toISOString() });
}
