/**
 * GET /api/schedule/external-coverage/source-boutiques
 * Returns boutiques that can be used as "source" for external coverage (all except host).
 * Requires schedule scope; RBAC aligned with schedule edit APIs.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { requireScheduleScope } from '@/lib/scope/scheduleScope';
import { prisma } from '@/lib/db';
import type { Role } from '@prisma/client';

export const dynamic = 'force-dynamic';

const ALLOWED_ROLES: Role[] = ['ADMIN', 'SUPER_ADMIN', 'MANAGER', 'ASSISTANT_MANAGER'];

export async function GET(request: NextRequest) {
  try {
    await requireRole(ALLOWED_ROLES);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const scopeResult = await requireScheduleScope(request);
  if (scopeResult.res) {
    return scopeResult.res;
  }
  const hostBoutiqueId = scopeResult.scope.boutiqueId;

  const boutiques = await prisma.boutique.findMany({
    where: {
      id: { not: hostBoutiqueId },
      isActive: true,
    },
    select: { id: true, name: true, code: true },
    orderBy: [{ name: 'asc' }, { code: 'asc' }],
  });

  return NextResponse.json({ boutiques, hostBoutiqueId });
}
