import { NextRequest, NextResponse } from 'next/server';
import { requireRole, getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { deactivateEmployeeCascade } from '@/lib/services/deactivateEmployeeCascade';
import { userListWhere } from '@/lib/userListWhere';
import * as bcrypt from 'bcryptjs';
import type { Role } from '@prisma/client';

export async function GET(request: NextRequest) {
  let user: Awaited<ReturnType<typeof getSessionUser>>;
  try {
    user = await requireRole(['ADMIN', 'SUPER_ADMIN'] as Role[]);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!user?.boutiqueId) {
    return NextResponse.json({ error: 'Account not assigned to a boutique' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q')?.trim();
  const includeSuperAdmin = searchParams.get('includeSuperAdmin') === 'true' && (user.role as Role) === 'SUPER_ADMIN';

  const users = await prisma.user.findMany({
    where: {
      ...userListWhere({ includeSuperAdmin }),
      ...(q
        ? {
            OR: [
              { empId: { contains: q, mode: 'insensitive' } },
              { employee: { name: { contains: q, mode: 'insensitive' } } },
            ],
          }
        : {}),
      boutiqueId: user.boutiqueId,
    },
    select: {
      id: true,
      empId: true,
      role: true,
      mustChangePassword: true,
      disabled: true,
      canEditSchedule: true,
      createdAt: true,
      employee: { select: { name: true } },
      _count: { select: { boutiqueMemberships: true } },
      boutiqueMemberships: {
        orderBy: { boutiqueId: 'asc' },
        take: 1,
        select: { boutique: { select: { id: true, code: true, name: true } } },
      },
    },
  });
  return NextResponse.json(
    users.map((u) => ({
      id: u.id,
      empId: u.empId,
      role: u.role,
      mustChangePassword: u.mustChangePassword,
      disabled: u.disabled,
      canEditSchedule: u.canEditSchedule,
      createdAt: u.createdAt,
      employee: u.employee,
      membershipsCount: u._count.boutiqueMemberships,
      primaryBoutique: u.boutiqueMemberships[0]?.boutique ?? null,
    }))
  );
}

export async function POST(request: NextRequest) {
  try {
    await requireRole(['ADMIN'] as Role[]);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const empId = String(body.empId ?? '').trim();
  const password = String(body.password ?? '');
  const role = String(body.role ?? 'EMPLOYEE').toUpperCase() as Role;

  if (!empId || !password) {
    return NextResponse.json({ error: 'empId and password required' }, { status: 400 });
  }
  if (!['EMPLOYEE', 'MANAGER', 'ASSISTANT_MANAGER', 'ADMIN'].includes(role)) {
    return NextResponse.json({ error: 'role must be EMPLOYEE, MANAGER, ASSISTANT_MANAGER, or ADMIN' }, { status: 400 });
  }

  const creatingUser = await getSessionUser();
  if (!creatingUser?.boutiqueId) {
    return NextResponse.json({ error: 'Account not assigned to a boutique' }, { status: 403 });
  }
  const hash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      empId,
      role,
      passwordHash: hash,
      mustChangePassword: true,
      canEditSchedule: role === 'ASSISTANT_MANAGER', // مساعد المدير: صلاحية تعديل الجدول افتراضياً
      boutiqueId: creatingUser.boutiqueId,
    },
  });
  return NextResponse.json({ id: user.id, empId: user.empId, role: user.role });
}

export async function PATCH(request: NextRequest) {
  try {
    await requireRole(['ADMIN'] as Role[]);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const empId = String(body.empId ?? '').trim();
  if (!empId) return NextResponse.json({ error: 'empId required' }, { status: 400 });

  const update: { role?: Role; disabled?: boolean; mustChangePassword?: boolean; canEditSchedule?: boolean } = {};
  if (body.role !== undefined) {
    const role = String(body.role).toUpperCase() as Role;
    if (!['EMPLOYEE', 'MANAGER', 'ASSISTANT_MANAGER', 'ADMIN'].includes(role)) {
      return NextResponse.json({ error: 'invalid role' }, { status: 400 });
    }
    update.role = role;
    if (role === 'ASSISTANT_MANAGER' && body.canEditSchedule === undefined) {
      update.canEditSchedule = true; // عند التحويل لمساعد مدير: منح صلاحية تعديل الجدول افتراضياً
    }
  }
  if (body.disabled !== undefined) update.disabled = Boolean(body.disabled);
  if (body.mustChangePassword !== undefined) update.mustChangePassword = Boolean(body.mustChangePassword);
  if (body.canEditSchedule !== undefined) update.canEditSchedule = Boolean(body.canEditSchedule);

  const user = await prisma.user.findUnique({
    where: { empId },
    select: { role: true },
  });
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (user.role === 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Cannot modify SUPER_ADMIN user' }, { status: 403 });
  }

  const updated = await prisma.user.update({
    where: { empId },
    data: update,
  });
  return NextResponse.json({
    id: updated.id,
    empId: updated.empId,
    role: updated.role,
    disabled: updated.disabled,
    canEditSchedule: updated.canEditSchedule,
  });
}

export async function DELETE(request: NextRequest) {
  let session: { id: string; empId: string; role: string };
  try {
    session = await requireRole(['ADMIN'] as Role[]);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const empId = searchParams.get('empId')?.trim();
  if (!empId) return NextResponse.json({ error: 'empId required' }, { status: 400 });

  if (session.empId === empId) {
    return NextResponse.json({ error: 'Cannot delete your own user account' }, { status: 400 });
  }

  const adminCount = await prisma.user.count({
    where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] }, disabled: false },
  });
  const target = await prisma.user.findUnique({ where: { empId }, select: { role: true, disabled: true } });
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (target.role === 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Cannot delete SUPER_ADMIN user' }, { status: 403 });
  }
  if (target.role === 'ADMIN' && adminCount <= 1) {
    return NextResponse.json({ error: 'Cannot delete the last admin' }, { status: 400 });
  }

  await deactivateEmployeeCascade(empId);
  await prisma.user.updateMany({ where: { empId }, data: { disabled: true } });
  await prisma.employee.updateMany({ where: { empId }, data: { active: false } });
  return NextResponse.json({ ok: true });
}
