/**
 * GET /api/leaves/requests — list leave requests (LeaveRequest) for operational boutique only.
 * Query: status (optional), self=true (own only). Boutique from operational scope only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { requireOperationalBoutique } from '@/lib/scope/requireOperationalBoutique';

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

  const where: { boutiqueId: string; status?: string; userId?: string } = {
    boutiqueId,
  };
  if (status) where.status = status;
  if (forSelf) where.userId = user.id;

  const list = await prisma.leaveRequest.findMany({
    where,
    include: {
      user: { select: { id: true, empId: true }, include: { employee: { select: { name: true } } } },
      boutique: { select: { id: true, code: true, name: true } },
      createdByUser: { select: { empId: true } },
      approvedByUser: { select: { empId: true } },
      escalatedByUser: { select: { empId: true } },
    },
    orderBy: [{ createdAt: 'desc' }],
  });

  return NextResponse.json(list);
}
