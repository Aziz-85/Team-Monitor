/**
 * POST /api/leaves/admin-approve — ADMIN/SUPER_ADMIN only. Finalize to APPROVED_ADMIN.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { evaluateLeaveApproval } from '@/lib/leaveRules';
import { writeLeaveAudit } from '@/lib/leaveAudit';

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const id = body.id ? String(body.id).trim() : '';
  const reason = body.reason != null ? String(body.reason) : undefined;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const req = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!req) return NextResponse.json({ error: 'Leave request not found' }, { status: 404 });
  if (req.status !== 'SUBMITTED') {
    return NextResponse.json({ error: 'Only SUBMITTED requests can be admin-approved' }, { status: 400 });
  }

  const evaluation = await evaluateLeaveApproval({
    id: req.id,
    boutiqueId: req.boutiqueId,
    userId: req.userId,
    startDate: req.startDate,
    endDate: req.endDate,
    status: req.status,
  });

  const before = JSON.stringify({ status: req.status });
  const after = JSON.stringify({
    status: 'APPROVED_ADMIN',
    evaluation: { reasons: evaluation.reasons },
  });

  await prisma.leaveRequest.update({
    where: { id },
    data: { status: 'APPROVED_ADMIN', approvedById: user.id, approvedAt: new Date() },
  });
  await writeLeaveAudit({
    actorUserId: user.id,
    action: 'LEAVE_APPROVED_ADMIN',
    entityId: id,
    boutiqueId: req.boutiqueId,
    beforeJson: before,
    afterJson: after,
    reason,
  });

  return NextResponse.json({ ok: true, status: 'APPROVED_ADMIN' });
}
