/**
 * Legacy path. Prefer POST /api/employees/[empId]/change-team.
 * Same governed logic: EmployeeTeamAssignment, effectiveFrom >= today, no Employee.team update, TEAM_CHANGED audit.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireRole, getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import { getWeekStart, isWeekLocked, isDayLocked } from '@/lib/services/scheduleLock';
import { getEmployeeTeam } from '@/lib/services/employeeTeam';
import type { Role, Team } from '@prisma/client';

const ALLOWED_ROLES: Role[] = ['MANAGER', 'ADMIN'];

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

  let body: { newTeam?: string; effectiveFrom?: string; reason?: string };
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

  const effectiveFrom = new Date(effectiveFromStr + 'T00:00:00Z');

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  if (effectiveFrom.getTime() < today.getTime()) {
    return NextResponse.json(
      { error: 'effectiveFrom must be today or a future date (no retroactive team change)' },
      { status: 400 }
    );
  }

  const employee = await prisma.employee.findUnique({
    where: { empId },
    select: { empId: true, name: true, boutiqueId: true },
  });
  if (!employee) {
    return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
  }

  const weekStart = getWeekStart(effectiveFrom);
  if (await isWeekLocked(weekStart, employee.boutiqueId)) {
    return NextResponse.json(
      { error: 'Cannot change team: the effective week is locked' },
      { status: 403 }
    );
  }
  if (await isDayLocked(effectiveFrom, employee.boutiqueId)) {
    return NextResponse.json(
      { error: 'Cannot change team: the effective day is locked' },
      { status: 403 }
    );
  }

  const dayBefore = new Date(effectiveFrom);
  dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
  let currentTeam: string;
  try {
    currentTeam = await getEmployeeTeam(empId, dayBefore);
  } catch {
    return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
  }

  if (currentTeam === newTeam) {
    return NextResponse.json(
      {
        error:
          'No change: team is already ' +
          newTeam +
          ' on the day before this date. To switch to the other team, use an effective date when they are currently on the opposite team (e.g. the next day or later).',
      },
      { status: 400 }
    );
  }

  const [latestAssignment, latestHistory] = await Promise.all([
    prisma.employeeTeamAssignment.findFirst({
      where: { empId },
      orderBy: { effectiveFrom: 'desc' },
      select: { effectiveFrom: true },
    }),
    prisma.employeeTeamHistory.findFirst({
      where: { empId },
      orderBy: { effectiveFrom: 'desc' },
      select: { effectiveFrom: true },
    }),
  ]);
  const lastEffective = [latestAssignment?.effectiveFrom, latestHistory?.effectiveFrom]
    .filter(Boolean)
    .map((d) => new Date(d!))
    .map((d) => (d.setUTCHours(0, 0, 0, 0), d))
    .sort((a, b) => b.getTime() - a.getTime())[0];
  if (lastEffective && effectiveFrom.getTime() <= lastEffective.getTime()) {
    return NextResponse.json(
      { error: 'effectiveFrom must be after the last team change date' },
      { status: 400 }
    );
  }

  await prisma.employeeTeamAssignment.create({
    data: {
      empId,
      team: newTeam,
      effectiveFrom,
      reason,
      createdByUserId: user.id,
    },
  });

  await logAudit(
    user.id,
    'TEAM_CHANGE_CREATED',
    'Employee',
    empId,
    JSON.stringify({ oldTeam: currentTeam }),
    JSON.stringify({ newTeam, effectiveFrom: effectiveFromStr }),
    reason,
    { module: 'TEAM', targetEmployeeId: empId, targetDate: effectiveFromStr }
  );

  return NextResponse.json({
    ok: true,
    empId,
    previousTeam: currentTeam,
    newTeam,
    effectiveFrom: effectiveFromStr,
    message: `Team updated effective ${effectiveFromStr}`,
  });
}
