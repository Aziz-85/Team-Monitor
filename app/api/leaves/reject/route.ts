/**
 * POST /api/leaves/reject — Manager (with canManageLeaves) or ADMIN. Status -> REJECTED.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { canManageLeavesInBoutique } from '@/lib/membershipPermissions';
import { writeLeaveAudit } from '@/lib/leaveAudit';
import type { Role } from '@prisma/client';

const SUBMITTED_OR_DRAFT = ['SUBMITTED', 'DRAFT'];

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const id = body.id ? String(body.id).trim() : '';
  const reason = body.reason != null ? String(body.reason) : undefined;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const req = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!req) return NextResponse.json({ error: 'Leave request not found' }, { status: 404 });
  if (!SUBMITTED_OR_DRAFT.includes(req.status)) {
    return NextResponse.json({ error: 'Request cannot be rejected in current status' }, { status: 400 });
  }

  const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';
  const canManage = await canManageLeavesInBoutique(user.id, user.role as Role, req.boutiqueId);
  if (!canManage && !isAdmin) {
    return NextResponse.json({ error: 'You do not have permission to reject leaves for this boutique' }, { status: 403 });
  }

  const before = JSON.stringify({ status: req.status });
  await prisma.leaveRequest.update({
    where: { id },
    data: { status: 'REJECTED', approvedById: user.id, approvedAt: new Date(), rejectionReason: reason ?? null },
  });
  await writeLeaveAudit({
    actorUserId: user.id,
    action: 'LEAVE_REJECTED',
    entityId: id,
    boutiqueId: req.boutiqueId,
    beforeJson: before,
    afterJson: JSON.stringify({ status: 'REJECTED', rejectionReason: reason }),
    reason,
  });

  return NextResponse.json({ ok: true, status: 'REJECTED' });
}
