import { NextRequest, NextResponse } from 'next/server';
import { requireRole, getSessionUser } from '@/lib/auth';
import { createOrExecuteApproval } from '@/lib/services/approvals';
import { applyTeamChange } from '@/lib/services/teamApply';
import { requiresApproval } from '@/lib/permissions';
import type { Role, Team } from '@prisma/client';

const ALLOWED_ROLES: Role[] = ['MANAGER', 'ASSISTANT_MANAGER', 'ADMIN'];

/**
 * POST /api/employees/[empId]/change-team
 * MANAGER/ADMIN: auto-apply. ASSISTANT_MANAGER: creates PENDING approval request.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ empId: string }> }
) {
  let user: Awaited<ReturnType<typeof getSessionUser>>;
  try {
    user = await requireRole(ALLOWED_ROLES);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { empId } = await params;
  if (!empId) return NextResponse.json({ error: 'empId required' }, { status: 400 });

  let body: { newTeam?: string; effectiveFrom?: string; reason?: string; allowImbalanceOverride?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const newTeam = String(body.newTeam ?? '').toUpperCase() as Team;
  if (newTeam !== 'A' && newTeam !== 'B') {
    return NextResponse.json({ error: 'newTeam must be A or B' }, { status: 400 });
  }

  const effectiveFromStr = String(body.effectiveFrom ?? '').trim();
  if (!effectiveFromStr || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveFromStr)) {
    return NextResponse.json({ error: 'effectiveFrom (YYYY-MM-DD) is required' }, { status: 400 });
  }

  const reason = String(body.reason ?? '').trim();
  if (!reason) {
    return NextResponse.json({ error: 'reason is required for team change' }, { status: 400 });
  }

  const payload = { empId, newTeam, effectiveFrom: effectiveFromStr, reason };

  if (requiresApproval(user.role)) {
    const result = await createOrExecuteApproval({
      user,
      module: 'TEAM',
      actionType: 'TEAM_CHANGE',
      payload,
      effectiveDate: effectiveFromStr,
      perform: () => applyTeamChange(payload, user.id),
    });
    if (result.status === 'PENDING_APPROVAL') {
      return NextResponse.json(
        { code: 'PENDING_APPROVAL', requestId: result.requestId },
        { status: 202 }
      );
    }
    return NextResponse.json(result.result);
  }

  try {
    const out = await applyTeamChange(payload, user.id);
    return NextResponse.json(out);
  } catch (e) {
    const err = e as Error;
    if (err.message === 'WEEK_LOCKED') {
      return NextResponse.json(
        { error: 'Cannot change team: the effective week is locked' },
        { status: 403 }
      );
    }
    if (err.message === 'DAY_LOCKED') {
      return NextResponse.json(
        { error: 'Cannot change team: the effective day is locked' },
        { status: 403 }
      );
    }
    if (err.message === 'Employee not found') {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    }
    return NextResponse.json({ error: err.message ?? 'Team change failed' }, { status: 400 });
  }
}
