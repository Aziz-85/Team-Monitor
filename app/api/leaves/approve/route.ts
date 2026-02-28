/**
 * POST /api/leaves/approve — Manager approves only if canManagerApprove && !requiresAdmin -> APPROVED_MANAGER. Admin can always approve (-> APPROVED_ADMIN).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { canManageLeavesInBoutique } from '@/lib/membershipPermissions';
import { getEffectiveAccess } from '@/lib/rbac/effectiveAccess';
import { isAdminOrSuperAdmin } from '@/lib/rbac';
import { evaluateLeaveApproval } from '@/lib/leaveRules';
import { writeLeaveAudit } from '@/lib/leaveAudit';
import type { Role } from '@prisma/client';

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const id = body.id ? String(body.id).trim() : '';
  const reason = body.reason != null ? String(body.reason) : undefined;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const req = await prisma.leaveRequest.findUnique({
    where: { id },
    include: { user: { select: { empId: true } }, boutique: { select: { id: true } } },
  });
  if (!req) return NextResponse.json({ error: 'Leave request not found' }, { status: 404 });
  if (req.status !== 'SUBMITTED') {
    return NextResponse.json({ error: 'Only SUBMITTED requests can be approved' }, { status: 400 });
  }

  const access = await getEffectiveAccess(
    { id: user.id, role: user.role as Role, canEditSchedule: user.canEditSchedule },
    req.boutiqueId
  );
  const isAdmin = isAdminOrSuperAdmin(access.effectiveRole as Role);
  const canManage =
    isAdmin ||
    (access.effectiveRole === 'MANAGER' &&
      (access.activeGrantIds.length > 0 ||
        (await canManageLeavesInBoutique(user.id, user.role as Role, req.boutiqueId))));
  if (!canManage) {
    return NextResponse.json({ error: 'You do not have permission to approve leaves for this boutique' }, { status: 403 });
  }

  const evaluation = await evaluateLeaveApproval({
    id: req.id,
    boutiqueId: req.boutiqueId,
    userId: req.userId,
    startDate: req.startDate,
    endDate: req.endDate,
    status: req.status,
  });

  if (!isAdmin) {
    if (evaluation.requiresAdmin) {
      return NextResponse.json(
        {
          error: 'This request requires admin approval',
          requiresAdmin: true,
          reasons: evaluation.reasons,
        },
        { status: 403 }
      );
    }
    if (!evaluation.canManagerApprove) {
      return NextResponse.json(
        { error: 'Manager cannot approve this request', reasons: evaluation.reasons },
        { status: 403 }
      );
    }
  }

  const newStatus = isAdmin ? 'APPROVED_ADMIN' : 'APPROVED_MANAGER';
  const before = JSON.stringify({ status: req.status });
  const after = JSON.stringify({
    status: newStatus,
    evaluation: { canManagerApprove: evaluation.canManagerApprove, requiresAdmin: evaluation.requiresAdmin, reasons: evaluation.reasons },
  });

  await prisma.leaveRequest.update({
    where: { id },
    data: { status: newStatus, approvedById: user.id, approvedAt: new Date() },
  });
  await writeLeaveAudit({
    actorUserId: user.id,
    action: isAdmin ? 'LEAVE_APPROVED_ADMIN' : 'LEAVE_APPROVED_MANAGER',
    entityId: id,
    boutiqueId: req.boutiqueId,
    beforeJson: before,
    afterJson: after,
    reason,
  });

  return NextResponse.json({ ok: true, status: newStatus });
}
