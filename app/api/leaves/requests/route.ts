/**
 * GET /api/leaves/requests — list LeaveRequest rows.
 * Query: status (optional), self=true (own rows only).
 * - Team list (no self): operational boutique only.
 * - My requests (self=true): all boutiques the user may access (memberships + session boutique fallback),
 *   not only the current “working on” boutique — so leaves filed under another branch still appear.
 */

import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { requireOperationalBoutique } from '@/lib/scope/requireOperationalBoutique';
import { getUserAllowedBoutiqueIds } from '@/lib/scope/resolveScope';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const scope = await requireOperationalBoutique(request);
  if (!scope.ok) return scope.res;
  const { boutiqueId } = scope;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') ?? undefined;
  const forSelf = searchParams.get('self') === 'true';

  const where: Prisma.LeaveRequestWhereInput = {};
  if (forSelf) {
    where.userId = user.id;
    let allowed = await getUserAllowedBoutiqueIds(user.id);
    if (allowed.length === 0 && user.boutiqueId) {
      allowed = [user.boutiqueId];
    }
    where.boutiqueId = allowed.length > 0 ? { in: allowed } : boutiqueId;
  } else {
    where.boutiqueId = boutiqueId;
  }
  if (status) where.status = status;

  const list = await prisma.leaveRequest.findMany({
    where,
    include: {
      user: { select: { id: true, empId: true, employee: { select: { name: true } } } },
      boutique: { select: { id: true, code: true, name: true } },
      createdByUser: { select: { empId: true } },
      approvedByUser: { select: { empId: true } },
      escalatedByUser: { select: { empId: true } },
    },
    orderBy: [{ createdAt: 'desc' }],
  });

  return NextResponse.json(list);
}
