/**
 * Sprint 2B: Approvals workflow.
 * ASSISTANT_MANAGER => PENDING only (create ApprovalRequest, do not apply).
 * MANAGER/ADMIN => auto-apply via perform(), no ApprovalRequest.
 */

import { prisma } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth';
import { canAutoApprove } from '@/lib/permissions';

export type ApprovalModule = 'SCHEDULE' | 'TEAM' | 'INVENTORY';

export type CreateOrExecuteResult =
  | { status: 'APPLIED'; result: unknown }
  | { status: 'PENDING_APPROVAL'; requestId: string };

/**
 * If user can auto-approve, runs perform() and returns APPLIED.
 * Otherwise creates ApprovalRequest(PENDING), logs APPROVAL_REQUEST_CREATED, returns PENDING_APPROVAL.
 */
export async function createOrExecuteApproval(options: {
  user: SessionUser;
  module: ApprovalModule;
  actionType: string;
  payload: unknown;
  effectiveDate?: string | null;
  weekStart?: string | null;
  /** Boutique scope for the request (required by DB when column is NOT NULL). */
  boutiqueId?: string | null;
  perform: () => Promise<unknown>;
}): Promise<CreateOrExecuteResult> {
  const { user, module, actionType, payload, effectiveDate, weekStart, boutiqueId, perform } = options;

  if (canAutoApprove(user.role)) {
    const result = await perform();
    return { status: 'APPLIED', result };
  }

  const effectiveDateObj = effectiveDate ? new Date(effectiveDate + 'T00:00:00Z') : null;
  const weekStartObj = weekStart ? new Date(weekStart + 'T00:00:00Z') : null;

  const createData: Parameters<typeof prisma.approvalRequest.create>[0]['data'] = {
    module,
    actionType,
    payload: payload as object,
    status: 'PENDING',
    requestedByUserId: user.id,
    effectiveDate: effectiveDateObj,
    weekStart: weekStartObj,
  };
  if (boutiqueId != null && boutiqueId !== '') {
    createData.boutiqueId = boutiqueId;
  }

  const req = await prisma.approvalRequest.create({
    data: createData,
  });

  await logAudit(
    user.id,
    'APPROVAL_REQUEST_CREATED',
    'ApprovalRequest',
    req.id,
    null,
    JSON.stringify({ requestId: req.id, module, actionType, effectiveDate, weekStart }),
    null,
    { module: 'APPROVALS', targetEmployeeId: (payload as { empId?: string })?.empId ?? null, targetDate: effectiveDate ?? undefined, weekStart: weekStart ?? undefined }
  );

  return { status: 'PENDING_APPROVAL', requestId: req.id };
}

/**
 * Approve a request: execute payload via apply logic, then set status APPROVED and audit.
 * Idempotent: if status !== PENDING, returns { ok: false, error: 'Already decided' }.
 * On execute failure (e.g. LOCKED), keeps PENDING and returns error.
 */
export async function approveRequest(
  requestId: string,
  approver: SessionUser,
  comment?: string | null
): Promise<{ ok: true; result?: unknown } | { ok: false; error: string; code?: string }> {
  const req = await prisma.approvalRequest.findUnique({
    where: { id: requestId },
  });
  if (!req) {
    return { ok: false, error: 'Request not found' };
  }
  if (req.status !== 'PENDING') {
    return { ok: false, error: 'Already decided' };
  }

  const payload = req.payload as Record<string, unknown>;

  try {
    let result: unknown = undefined;

    if (req.module === 'SCHEDULE' && req.actionType === 'OVERRIDE_CREATE') {
      const { applyOverrideChange } = await import('@/lib/services/scheduleApply');
      result = await applyOverrideChange(
        {
          empId: String(payload.empId ?? ''),
          date: String(payload.date ?? ''),
          overrideShift: String(payload.overrideShift ?? 'NONE'),
          reason: String(payload.reason ?? ''),
        },
        approver.id,
        {
          boutiqueId: req.boutiqueId ?? undefined,
          sourceBoutiqueId: typeof payload.sourceBoutiqueId === 'string' ? payload.sourceBoutiqueId : undefined,
        }
      );
    } else if (req.module === 'SCHEDULE' && req.actionType === 'WEEK_SAVE') {
      const { applyScheduleGridSave } = await import('@/lib/services/scheduleApply');
      const changes = Array.isArray(payload.changes) ? payload.changes as Array<{ empId: string; date: string; newShift: string; originalEffectiveShift: string; overrideId: string | null }> : [];
      const boutiqueIds = Array.isArray(payload.boutiqueIds) ? payload.boutiqueIds as string[] : undefined;
      result = await applyScheduleGridSave(
        { reason: String(payload.reason ?? ''), changes },
        approver.id,
        { boutiqueIds }
      );
      if (req.weekStart && changes.length > 0) {
        const weekStartStr = req.weekStart instanceof Date ? req.weekStart.toISOString().slice(0, 10) : String(req.weekStart).slice(0, 10);
        const { buildScheduleEditAuditPayload } = await import('@/lib/schedule/scheduleEditAudit');
        const changesJson = buildScheduleEditAuditPayload(weekStartStr, changes);
        await prisma.scheduleEditAudit.create({
          data: {
            weekStart: req.weekStart instanceof Date ? req.weekStart : new Date(weekStartStr + 'T00:00:00Z'),
            editorId: approver.id,
            changesJson: changesJson as object,
            source: 'WEB',
            boutiqueId: boutiqueIds?.[0] ?? null,
          },
        });
      }
    } else if (req.module === 'TEAM' && req.actionType === 'TEAM_CHANGE') {
      const { applyTeamChange } = await import('@/lib/services/teamApply');
      result = await applyTeamChange(
        {
          empId: String(payload.empId ?? ''),
          newTeam: String(payload.newTeam ?? ''),
          effectiveFrom: String(payload.effectiveFrom ?? ''),
          reason: String(payload.reason ?? ''),
        },
        approver.id
      );
    } else if (req.module === 'SALES' && req.actionType === 'EDIT_SALES_DAY') {
      const dateStr = String(payload.date ?? '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return { ok: false, error: 'Invalid date in payload' };
      }
      const { toRiyadhDateOnly } = await import('@/lib/time');
      const dateOnly = toRiyadhDateOnly(new Date(dateStr + 'T12:00:00.000Z'));
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);
      await prisma.salesEditGrant.upsert({
        where: {
          userId_date: { userId: req.requestedByUserId, date: dateOnly },
        },
        create: {
          userId: req.requestedByUserId,
          date: dateOnly,
          grantedByUserId: approver.id,
          expiresAt,
          reason: 'Approved request',
        },
        update: {
          grantedByUserId: approver.id,
          grantedAt: new Date(),
          expiresAt,
          reason: 'Approved request',
        },
      });
      result = { granted: true, date: dateStr, expiresAt: expiresAt.toISOString() };
    } else {
      return { ok: false, error: 'Unsupported module/actionType for approval' };
    }

    await prisma.approvalRequest.update({
      where: { id: requestId },
      data: {
        status: 'APPROVED',
        decidedByUserId: approver.id,
        decidedAt: new Date(),
        decisionComment: comment ?? null,
      },
    });

    await logAudit(
      approver.id,
      'APPROVAL_APPROVED',
      'ApprovalRequest',
      requestId,
      JSON.stringify({ status: 'PENDING' }),
      JSON.stringify({ status: 'APPROVED', requestId, module: req.module, actionType: req.actionType }),
      comment ?? null,
      { module: 'APPROVALS', targetEmployeeId: (payload as { empId?: string })?.empId ?? null }
    );

    return { ok: true, result };
  } catch (e) {
    const err = e as Error & { code?: string };
    if (err.message?.includes('locked') || err.name === 'ScheduleLockedError') {
      return { ok: false, error: err.message ?? 'Locked', code: 'LOCKED' };
    }
    return { ok: false, error: err.message ?? 'Execution failed' };
  }
}

/**
 * Reject a request. Idempotent: if status !== PENDING, returns { ok: false }.
 */
export async function rejectRequest(
  requestId: string,
  decider: SessionUser,
  comment?: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  const req = await prisma.approvalRequest.findUnique({
    where: { id: requestId },
  });
  if (!req) {
    return { ok: false, error: 'Request not found' };
  }
  if (req.status !== 'PENDING') {
    return { ok: false, error: 'Already decided' };
  }

  await prisma.approvalRequest.update({
    where: { id: requestId },
    data: {
      status: 'REJECTED',
      decidedByUserId: decider.id,
      decidedAt: new Date(),
      decisionComment: comment ?? null,
    },
  });

  await logAudit(
    decider.id,
    'APPROVAL_REJECTED',
    'ApprovalRequest',
    requestId,
    JSON.stringify({ status: 'PENDING' }),
    JSON.stringify({ status: 'REJECTED', requestId, module: req.module, actionType: req.actionType }),
    comment ?? null,
    { module: 'APPROVALS' }
  );

  return { ok: true };
}
