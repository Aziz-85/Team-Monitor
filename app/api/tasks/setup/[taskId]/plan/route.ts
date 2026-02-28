import { NextRequest, NextResponse } from 'next/server';
import { requireRole, getSessionUser } from '@/lib/auth';
import { getOperationalScope } from '@/lib/scope/operationalScope';
import { assertEmployeesInBoutiqueScope, EmployeeOutOfScopeError, logCrossBoutiqueBlocked } from '@/lib/tenancy/operationalRoster';
import { prisma } from '@/lib/db';
import type { Role } from '@prisma/client';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  let user: Awaited<ReturnType<typeof getSessionUser>>;
  try {
    user = await requireRole(['MANAGER', 'ADMIN'] as Role[]);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const scope = await getOperationalScope(request);
  if (!scope?.boutiqueId) {
    return NextResponse.json({ error: 'No operational scope' }, { status: 403 });
  }
  const boutiqueIds = scope.boutiqueIds;

  try {
    const { taskId } = await params;
    const body = await request.json();
    const primaryEmpId = String(body.primaryEmpId ?? '').trim();
    const backup1EmpId = (body.backup1EmpId != null && String(body.backup1EmpId).trim() !== '')
      ? String(body.backup1EmpId).trim()
      : primaryEmpId;
    const backup2EmpId = (body.backup2EmpId != null && String(body.backup2EmpId).trim() !== '')
      ? String(body.backup2EmpId).trim()
      : primaryEmpId;

    if (!primaryEmpId) {
      return NextResponse.json({ error: 'primaryEmpId required' }, { status: 400 });
    }

    const b1 = (body.backup1EmpId != null && String(body.backup1EmpId).trim() !== '') ? String(body.backup1EmpId).trim() : null;
    const b2 = (body.backup2EmpId != null && String(body.backup2EmpId).trim() !== '') ? String(body.backup2EmpId).trim() : null;
    if (b1 && b1 === primaryEmpId) {
      return NextResponse.json({ error: 'Primary and Backup 1 cannot be the same', code: 'DUPLICATE_PRIMARY_BACKUP1' }, { status: 400 });
    }
    if (b2 && b2 === primaryEmpId) {
      return NextResponse.json({ error: 'Primary and Backup 2 cannot be the same', code: 'DUPLICATE_PRIMARY_BACKUP2' }, { status: 400 });
    }
    if (b1 && b2 && b1 === b2) {
      return NextResponse.json({ error: 'Backup 1 and Backup 2 cannot be the same', code: 'DUPLICATE_BACKUP1_BACKUP2' }, { status: 400 });
    }

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { boutiqueId: true },
    });
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    if (task.boutiqueId && !boutiqueIds.includes(task.boutiqueId)) {
      return NextResponse.json({ error: 'Task not in your operational scope' }, { status: 403 });
    }

    const empIdsToCheck = Array.from(new Set([primaryEmpId, backup1EmpId, backup2EmpId].filter(Boolean)));
    try {
      await assertEmployeesInBoutiqueScope(empIdsToCheck, boutiqueIds);
    } catch (e) {
      if (e instanceof EmployeeOutOfScopeError) {
        const invalidEmpIds = (e as EmployeeOutOfScopeError & { invalidEmpIds?: string[] }).invalidEmpIds ?? [e.empId];
        await logCrossBoutiqueBlocked(user.id, 'TASKS', invalidEmpIds, boutiqueIds, 'Task plan assign');
        return NextResponse.json(
          { error: 'Employee not in this boutique scope', code: 'CROSS_BOUTIQUE_BLOCKED', invalidEmpIds },
          { status: 400 }
        );
      }
      throw e;
    }

    const existing = await prisma.taskPlan.findFirst({ where: { taskId } });
    const data = { taskId, primaryEmpId, backup1EmpId, backup2EmpId };

    const plan = existing
      ? await prisma.taskPlan.update({ where: { id: existing.id }, data })
      : await prisma.taskPlan.create({ data });

    return NextResponse.json(plan);
  } catch (err) {
    console.error('/api/tasks/setup/[taskId]/plan PUT error:', err);
    return NextResponse.json(
      { error: 'Server error', details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
