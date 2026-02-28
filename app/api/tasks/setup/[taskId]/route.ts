import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { resolveScopeForUser } from '@/lib/scope/resolveScope';
import { canManageInBoutique } from '@/lib/membershipPermissions';
import type { Role } from '@prisma/client';

async function assertTaskPermission(userId: string, userRole: Role, taskId: string) {
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { boutiqueId: true } });
  if (!task) return { ok: false as const, status: 404 as const };
  const boutiqueId = task.boutiqueId;
  if (!boutiqueId) return { ok: false as const, status: 403 as const, message: 'Task has no boutique' };
  const resolved = await resolveScopeForUser(userId, userRole, null);
  if (!resolved.boutiqueIds.includes(boutiqueId)) return { ok: false as const, status: 403 as const, message: 'Boutique not in scope' };
  const canManage = await canManageInBoutique(userId, userRole, boutiqueId, 'canManageTasks');
  if (!canManage) return { ok: false as const, status: 403 as const, message: 'No permission to manage tasks for this boutique' };
  return { ok: true as const };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['MANAGER', 'ADMIN'].includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { taskId } = await params;
  const check = await assertTaskPermission(user.id, user.role as Role, taskId);
  if (!check.ok) {
    if (check.status === 404) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    return NextResponse.json({ error: check.message }, { status: check.status });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const name = body.name !== undefined ? String(body.name).trim() : undefined;
    const active = body.active !== undefined ? Boolean(body.active) : undefined;

    const task = await prisma.task.update({
      where: { id: taskId },
      data: {
        ...(name !== undefined && { name }),
        ...(active !== undefined && { active }),
      },
    });
    return NextResponse.json(task);
  } catch (err) {
    console.error('/api/tasks/setup/[taskId] PATCH error:', err);
    return NextResponse.json(
      { error: 'Server error', details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['MANAGER', 'ADMIN'].includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { taskId } = await params;
  const check = await assertTaskPermission(user.id, user.role as Role, taskId);
  if (!check.ok) {
    if (check.status === 404) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    return NextResponse.json({ error: check.message }, { status: check.status });
  }

  await prisma.task.update({
    where: { id: taskId },
    data: { active: false },
  });
  return NextResponse.json({ ok: true });
}
