import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { requireBoutiqueScope } from '@/lib/scope/ssot';
import { canManageInBoutique } from '@/lib/membershipPermissions';
import type { Role } from '@prisma/client';

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['MANAGER', 'ADMIN'].includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const scopeResult = await requireBoutiqueScope(request, {
      allowGlobal: false,
      modeName: 'TasksSetup',
    });
    if (scopeResult.res) return scopeResult.res;
    const boutiqueIds = scopeResult.scope.boutiqueIds;
    if (boutiqueIds.length === 0) {
      return NextResponse.json([]);
    }
    const canManage = await canManageInBoutique(user.id, user.role as Role, boutiqueIds[0]!, 'canManageTasks');
    if (!canManage) {
      return NextResponse.json({ error: 'You do not have permission to manage tasks in this boutique' }, { status: 403 });
    }
    const tasks = await prisma.task.findMany({
      where: { active: true, boutiqueId: { in: boutiqueIds } },
      include: {
        taskPlans: {
          include: {
            primary: { select: { empId: true, name: true } },
            backup1: { select: { empId: true, name: true } },
            backup2: { select: { empId: true, name: true } },
          },
        },
        taskSchedules: true,
      },
    });
    return NextResponse.json(tasks);
  } catch (err) {
    console.error('/api/tasks/setup GET error:', err);
    return NextResponse.json(
      { error: 'Server error', details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['MANAGER', 'ADMIN'].includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const name = String(body.name ?? '').trim();
  const boutiqueIdParam = body.boutiqueId ? String(body.boutiqueId).trim() : null;
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });

  const scopeResult = await requireBoutiqueScope(request, {
    allowGlobal: false,
    modeName: 'TasksSetup',
  });
  if (scopeResult.res) return scopeResult.res;
  const boutiqueIds = scopeResult.scope.boutiqueIds;
  const effectiveBoutiqueId = boutiqueIdParam && boutiqueIds.includes(boutiqueIdParam) ? boutiqueIdParam : (boutiqueIds[0] ?? null);
  if (!effectiveBoutiqueId) {
    return NextResponse.json({ error: 'No boutique in scope' }, { status: 403 });
  }
  const canManage = await canManageInBoutique(user.id, user.role as Role, effectiveBoutiqueId, 'canManageTasks');
  if (!canManage) {
    return NextResponse.json({ error: 'You do not have permission to manage tasks for this boutique' }, { status: 403 });
  }

  const task = await prisma.task.create({
    data: { name, active: true, boutiqueId: effectiveBoutiqueId },
  });
  return NextResponse.json(task);
}
