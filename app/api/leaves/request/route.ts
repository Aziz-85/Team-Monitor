/**
 * POST /api/leaves/request — employee submit leave request (within their boutique scope).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getUserAllowedBoutiqueIds } from '@/lib/scope/resolveScope';
import type { LeaveType } from '@prisma/client';

const LEAVE_TYPES: LeaveType[] = ['ANNUAL', 'EXHIBITION', 'SICK', 'OTHER_BRANCH', 'EMERGENCY', 'OTHER'];

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const boutiqueId = body.boutiqueId ? String(body.boutiqueId).trim() : '';
  const startDateStr = body.startDate ? String(body.startDate).trim() : '';
  const endDateStr = body.endDate ? String(body.endDate).trim() : '';
  const type = body.type ? String(body.type).toUpperCase() : '';
  const notes = body.notes != null ? String(body.notes) : null;
  const submitNow = body.submit === true; // if true, create as SUBMITTED (else DRAFT)

  if (!boutiqueId || !startDateStr || !endDateStr || !type) {
    return NextResponse.json({ error: 'boutiqueId, startDate, endDate, type required' }, { status: 400 });
  }
  if (!LEAVE_TYPES.includes(type as LeaveType)) {
    return NextResponse.json({ error: 'Invalid leave type' }, { status: 400 });
  }

  const startDate = new Date(startDateStr);
  const endDate = new Date(endDateStr);
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return NextResponse.json({ error: 'Invalid dates' }, { status: 400 });
  }
  if (endDate < startDate) {
    return NextResponse.json({ error: 'endDate must be >= startDate' }, { status: 400 });
  }

  const allowedBoutiqueIds = await getUserAllowedBoutiqueIds(user.id);
  if (!allowedBoutiqueIds.includes(boutiqueId)) {
    return NextResponse.json({ error: 'Boutique not in your scope' }, { status: 403 });
  }

  const status = submitNow ? 'SUBMITTED' : 'DRAFT';
  const created = await prisma.leaveRequest.create({
    data: {
      boutiqueId,
      userId: user.id,
      startDate,
      endDate,
      type: type as LeaveType,
      status,
      notes: notes ?? undefined,
      createdById: user.id,
    },
    include: {
      boutique: { select: { code: true, name: true } },
    },
  });

  return NextResponse.json(created);
}
