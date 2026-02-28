/**
 * POST /api/leaves/escalate — Manager sends to admin. Status stays SUBMITTED; set escalatedAt, escalatedById.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { canManageLeavesInBoutique } from '@/lib/membershipPermissions';
import { evaluateLeaveApproval } from '@/lib/leaveRules';
import { writeLeaveAudit } from '@/lib/leaveAudit';
import type { Role } from '@prisma/client';

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Use admin-approve to approve as admin' }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const id = body.id ? String(body.id).trim() : '';
  const reason = body.reason != null ? String(body.reason) : undefined;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const req = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!req) return NextResponse.json({ error: 'Leave request not found' }, { status: 404 });
  if (req.status !== 'SUBMITTED') {
    return NextResponse.json({ error: 'Only SUBMITTED requests can be escalated' }, { status: 400 });
  }

  const canManage = await canManageLeavesInBoutique(user.id, user.role as Role, req.boutiqueId);
  if (!canManage) {
    return NextResponse.json({ error: 'You do not have permission to escalate leaves for this boutique' }, { status: 403 });
  }

  const evaluation = await evaluateLeaveApproval({
    id: req.id,
    boutiqueId: req.boutiqueId,
    userId: req.userId,
    startDate: req.startDate,
    endDate: req.endDate,
    status: req.status,
  });
  const after = JSON.stringify({
    escalated: true,
    evaluation: { requiresAdmin: evaluation.requiresAdmin, reasons: evaluation.reasons },
  });

  await prisma.leaveRequest.update({
    where: { id },
    data: { escalatedAt: new Date(), escalatedById: user.id },
  });
  await writeLeaveAudit({
    actorUserId: user.id,
    action: 'LEAVE_ESCALATED',
    entityId: id,
    boutiqueId: req.boutiqueId,
    beforeJson: JSON.stringify({ status: req.status }),
    afterJson: after,
    reason,
  });

  return NextResponse.json({ ok: true, escalated: true, reasons: evaluation.reasons });
}
