/**
 * GET /api/leaves/requests — list LeaveRequest rows and (for self) legacy Leave (schedule) rows.
 * Query: status (optional), self=true (own rows only).
 * - Team list (no self): operational boutique only; each row has recordSource REQUEST.
 * - My requests (self=true): memberships + session boutique for LeaveRequest; same boutiques for
 *   legacy Leave by empId — merged list sorted by startDate desc.
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

  let allowedBoutiqueIds: string[] = [];
  if (forSelf) {
    allowedBoutiqueIds = await getUserAllowedBoutiqueIds(user.id);
    if (allowedBoutiqueIds.length === 0 && user.boutiqueId) {
      allowedBoutiqueIds = [user.boutiqueId];
    }
  }

  const where: Prisma.LeaveRequestWhereInput = {};
  if (forSelf) {
    where.userId = user.id;
    where.boutiqueId = allowedBoutiqueIds.length > 0 ? { in: allowedBoutiqueIds } : boutiqueId;
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

  const requestsJson = list.map((row) => ({ ...row, recordSource: 'REQUEST' as const }));

  if (!forSelf) {
    return NextResponse.json(requestsJson);
  }

  const legacyWhere: Prisma.LeaveWhereInput = {
    empId: user.empId,
    employee: {
      boutiqueId: allowedBoutiqueIds.length > 0 ? { in: allowedBoutiqueIds } : boutiqueId,
    },
  };

  const legacyLeaves = await prisma.leave.findMany({
    where: legacyWhere,
    include: {
      employee: {
        select: {
          name: true,
          boutiqueId: true,
          boutique: { select: { id: true, code: true, name: true } },
        },
      },
    },
    orderBy: [{ startDate: 'desc' }],
  });

  const scheduleJson = legacyLeaves.map((l) => ({
    id: `schedule:${l.id}`,
    recordSource: 'SCHEDULE' as const,
    boutiqueId: l.employee.boutiqueId,
    userId: user.id,
    startDate: l.startDate,
    endDate: l.endDate,
    type: l.type,
    status: l.status,
    notes: l.notes,
    createdAt: l.createdAt,
    user: { empId: l.empId, employee: { name: l.employee.name } },
    boutique: l.employee.boutique,
    createdByUser: null,
    approvedByUser: null,
    escalatedByUser: null,
  }));

  const combined = [...requestsJson, ...scheduleJson];
  combined.sort((a, b) => {
    const ta = new Date(a.startDate).getTime();
    const tb = new Date(b.startDate).getTime();
    return tb - ta;
  });

  return NextResponse.json(combined);
}
