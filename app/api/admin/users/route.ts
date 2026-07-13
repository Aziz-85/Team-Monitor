import { NextRequest, NextResponse } from 'next/server';
import { requireRole, getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { deactivateEmployeeCascade } from '@/lib/services/deactivateEmployeeCascade';
import { userListWhere } from '@/lib/userListWhere';
import * as bcrypt from 'bcryptjs';
import { validatePasswordStrength, GENERIC_PASSWORD_ERROR } from '@/lib/passwordPolicy';
import type { Role } from '@prisma/client';
import {
  parseJsonBody,
  userCreateSchema,
  userDeleteQuerySchema,
  userPatchSchema,
} from '@/lib/validation';

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

  const parsed = await parseJsonBody(request, userCreateSchema);
  if (!parsed.ok) return parsed.response;
  const { empId, password, role } = parsed.data;

  const policy = validatePasswordStrength(password, { empId });
  if (!policy.ok) {
    return NextResponse.json({ error: GENERIC_PASSWORD_ERROR }, { status: 400 });
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

  const parsed = await parseJsonBody(request, userPatchSchema);
  if (!parsed.ok) return parsed.response;
  const { empId, role, disabled, mustChangePassword, canEditSchedule } = parsed.data;

  const update: { role?: Role; disabled?: boolean; mustChangePassword?: boolean; canEditSchedule?: boolean } = {};
  if (role !== undefined) {
    update.role = role as Role;
    if (role === 'ASSISTANT_MANAGER' && canEditSchedule === undefined) {
      update.canEditSchedule = true;
    }
  }
  if (disabled !== undefined) update.disabled = disabled;
  if (mustChangePassword !== undefined) update.mustChangePassword = mustChangePassword;
  if (canEditSchedule !== undefined) update.canEditSchedule = canEditSchedule;

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
  const deleteQuery = userDeleteQuerySchema.safeParse({
    empId: searchParams.get('empId')?.trim() ?? '',
  });
  if (!deleteQuery.success) {
    return NextResponse.json({ error: 'empId required' }, { status: 400 });
  }
  const { empId } = deleteQuery.data;

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
