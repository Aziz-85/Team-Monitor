/**
 * GET /api/leaves/evaluate?id= — return evaluateLeaveApproval(result) for a leave request. Manager/Admin only for others' requests.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { evaluateLeaveApproval } from '@/lib/leaveRules';
import { canManageLeavesInBoutique } from '@/lib/membershipPermissions';
import type { Role } from '@prisma/client';

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id')?.trim();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const req = await prisma.leaveRequest.findUnique({
    where: { id },
    select: { id: true, boutiqueId: true, userId: true, startDate: true, endDate: true, status: true },
  });
  if (!req) return NextResponse.json({ error: 'Leave request not found' }, { status: 404 });

  // Employee can evaluate own (to see why escalation); manager/admin can evaluate any in their scope
  if (req.userId !== user.id) {
    const canManage = await canManageLeavesInBoutique(user.id, user.role as Role, req.boutiqueId);
    if (!canManage && user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const evaluation = await evaluateLeaveApproval({
    id: req.id,
    boutiqueId: req.boutiqueId,
    userId: req.userId,
    startDate: req.startDate,
    endDate: req.endDate,
    status: req.status ?? undefined,
  });

  return NextResponse.json(evaluation);
}
