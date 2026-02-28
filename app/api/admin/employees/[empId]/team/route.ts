import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getEmployeeTeam } from '@/lib/services/employeeTeam';
import type { Role } from '@prisma/client';

const ALLOWED_ROLES: Role[] = ['MANAGER', 'ADMIN', 'ASSISTANT_MANAGER'];

/** GET: current team (effective today) and team history for an employee. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ empId: string }> }
) {
  try {
    await requireRole(ALLOWED_ROLES);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { empId } = await params;
  if (!empId) return NextResponse.json({ error: 'empId required' }, { status: 400 });

  const employee = await prisma.employee.findUnique({
    where: { empId },
    select: { empId: true, name: true, team: true },
  });
  if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });

  const today = new Date();
  today.setUTCHours(12, 0, 0, 0);
  let currentTeam: string;
  try {
    currentTeam = await getEmployeeTeam(empId, today);
  } catch {
    currentTeam = employee.team;
  }

  const [assignments, history] = await Promise.all([
    prisma.employeeTeamAssignment.findMany({
      where: { empId },
      orderBy: { effectiveFrom: 'desc' },
      select: {
        id: true,
        team: true,
        effectiveFrom: true,
        reason: true,
        createdAt: true,
        createdByUser: { select: { empId: true } },
      },
    }),
    prisma.employeeTeamHistory.findMany({
      where: { empId },
      orderBy: { effectiveFrom: 'desc' },
      select: {
        id: true,
        team: true,
        effectiveFrom: true,
        createdAt: true,
        createdByUser: { select: { empId: true } },
      },
    }),
  ]);

  return NextResponse.json({
    empId,
    name: employee.name,
    currentTeam,
    assignments: assignments.map((a) => ({
      id: a.id,
      team: a.team,
      effectiveFrom: a.effectiveFrom.toISOString().slice(0, 10),
      reason: a.reason,
      createdAt: a.createdAt.toISOString(),
      createdByEmpId: a.createdByUser?.empId ?? null,
    })),
    history: history.map((h) => ({
      id: h.id,
      team: h.team,
      effectiveFrom: h.effectiveFrom.toISOString().slice(0, 10),
      createdAt: h.createdAt.toISOString(),
      createdByEmpId: h.createdByUser?.empId ?? null,
    })),
  });
}
