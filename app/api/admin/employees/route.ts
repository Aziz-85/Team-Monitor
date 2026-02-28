import { NextRequest, NextResponse } from 'next/server';
import { requireRole, getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import { getEmployeeTeam } from '@/lib/services/employeeTeam';
import { deactivateEmployeeCascade } from '@/lib/services/deactivateEmployeeCascade';
import type { Role, Team, EmployeePosition } from '@prisma/client';
import { writeAdminAudit } from '@/lib/admin/audit';

const VALID_POSITIONS: EmployeePosition[] = ['BOUTIQUE_MANAGER', 'ASSISTANT_MANAGER', 'SENIOR_SALES', 'SALES'];

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
  const boutiqueIds = [user.boutiqueId];

  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q')?.trim();
  const includeSuperAdmin = searchParams.get('includeSuperAdmin') === 'true' && (user.role as Role) === 'SUPER_ADMIN';

  const andConditions: Prisma.EmployeeWhereInput[] = [];
  if (!includeSuperAdmin) {
    andConditions.push({ OR: [{ user: { is: null } }, { user: { role: { not: 'SUPER_ADMIN' } } }] });
  }
  if (q) {
    andConditions.push({
      OR: [
        { empId: { contains: q, mode: 'insensitive' } },
        { name: { contains: q, mode: 'insensitive' } },
      ],
    });
  }

  const employees = await prisma.employee.findMany({
    where: {
      isSystemOnly: false,
      boutiqueId: { in: boutiqueIds },
      ...(andConditions.length > 0 ? { AND: andConditions } : {}),
    },
    orderBy: { empId: 'asc' },
    include: {
      user: {
        select: { role: true, disabled: true, mustChangePassword: true },
      },
    },
  });

  const uniqueBoutiqueIds = Array.from(new Set(employees.map((e) => e.boutiqueId).filter(Boolean))) as string[];
  const boutiques =
    uniqueBoutiqueIds.length > 0
      ? await prisma.boutique.findMany({
          where: { id: { in: uniqueBoutiqueIds } },
          select: { id: true, code: true, name: true },
        })
      : [];
  const boutiqueById = new Map(boutiques.map((b) => [b.id, b]));

  const today = new Date();
  today.setUTCHours(12, 0, 0, 0);
  const withCurrentTeam = await Promise.all(
    employees.map(async (e) => {
      let currentTeam: string = e.team;
      try {
        currentTeam = await getEmployeeTeam(e.empId, today);
      } catch {
        // keep e.team
      }
      const boutique = e.boutiqueId ? boutiqueById.get(e.boutiqueId) ?? null : null;
      const { user, ...rest } = e;
      return { ...rest, user, boutique, currentTeam };
    })
  );
  return NextResponse.json(withCurrentTeam);
}

export async function POST(request: NextRequest) {
  let user: Awaited<ReturnType<typeof getSessionUser>>;
  try {
    user = await requireRole(['ADMIN'] as Role[]);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!user?.boutiqueId) {
    return NextResponse.json({ error: 'Account not assigned to a boutique' }, { status: 403 });
  }
  const sessionBoutiqueId = user.boutiqueId;

  const body = await request.json();
  const empId = String(body.empId ?? '').trim();
  const name = String(body.name ?? '').trim();
  const team = String(body.team ?? 'A').toUpperCase() as Team;
  const weeklyOffDay = Number(body.weeklyOffDay ?? 5);
  const position = body.position != null && VALID_POSITIONS.includes(body.position as EmployeePosition)
    ? (body.position as EmployeePosition)
    : undefined;
  const email = body.email != null ? String(body.email).trim() : null;
  const phone = body.phone != null ? String(body.phone).trim() : null;
  const language = body.language === 'ar' ? 'ar' : 'en';

  if (!empId || !name) {
    return NextResponse.json({ error: 'empId and name required' }, { status: 400 });
  }
  if (!['A', 'B'].includes(team)) {
    return NextResponse.json({ error: 'team must be A or B' }, { status: 400 });
  }
  if (weeklyOffDay < 0 || weeklyOffDay > 6) {
    return NextResponse.json({ error: 'weeklyOffDay must be 0-6' }, { status: 400 });
  }

  const existing = await prisma.employee.findUnique({
    where: { empId },
    select: { empId: true },
  });
  if (existing) {
    return NextResponse.json(
      { error: 'An employee with this ID already exists' },
      { status: 409 }
    );
  }

  try {
    const employee = await prisma.employee.create({
      data: {
        empId,
        name,
        team,
        weeklyOffDay,
        position,
        email,
        phone,
        language,
        active: true,
        boutiqueId: sessionBoutiqueId,
      },
    });
    const boutique = employee.boutiqueId
      ? await prisma.boutique.findUnique({
          where: { id: employee.boutiqueId },
          select: { id: true, code: true, name: true },
        })
      : null;
    return NextResponse.json({ ...employee, boutique });
  } catch (e: unknown) {
    const prismaErr = e as { code?: string; meta?: { target?: string[] } };
    if (prismaErr.code === 'P2002' && prismaErr.meta?.target?.includes('empId')) {
      return NextResponse.json(
        { error: 'An employee with this ID already exists' },
        { status: 409 }
      );
    }
    throw e;
  }
}

export async function PATCH(request: NextRequest) {
  let session: { id: string; empId: string };
  try {
    session = await requireRole(['ADMIN'] as Role[]);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const empId = String(body.empId ?? '').trim();
  if (!empId) return NextResponse.json({ error: 'empId required' }, { status: 400 });

  const existing = await prisma.employee.findUnique({
    where: { empId, isSystemOnly: false },
    select: { empId: true, user: { select: { role: true } } },
  });
  if (!existing) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
  if (existing.user?.role === 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Cannot modify employee linked to SUPER_ADMIN' }, { status: 403 });
  }

  const update: {
    name?: string;
    email?: string | null;
    phone?: string | null;
    weeklyOffDay?: number;
    position?: EmployeePosition | null;
    language?: string;
    active?: boolean;
    boutiqueId?: string;
  } = {};
  if (body.name !== undefined) update.name = String(body.name).trim();
  if (body.active !== undefined) update.active = Boolean(body.active);
  if (body.email !== undefined) update.email = body.email != null ? String(body.email).trim() : null;
  if (body.phone !== undefined) update.phone = body.phone != null ? String(body.phone).trim() : null;
  if (body.team !== undefined) {
    return NextResponse.json(
      { error: 'Team cannot be changed here. Use Change Team (effective-date) for future team changes.' },
      { status: 400 }
    );
  }
  if (body.weeklyOffDay !== undefined) {
    const n = Number(body.weeklyOffDay);
    if (n < 0 || n > 6) return NextResponse.json({ error: 'weeklyOffDay must be 0-6' }, { status: 400 });
    update.weeklyOffDay = n;
  }
  if (body.position !== undefined) {
    update.position = body.position == null || body.position === ''
      ? null
      : VALID_POSITIONS.includes(body.position as EmployeePosition)
        ? (body.position as EmployeePosition)
        : undefined;
    if (update.position === undefined) delete update.position;
  }
  if (body.language !== undefined) update.language = body.language === 'ar' ? 'ar' : 'en';
  if (body.boutiqueId !== undefined) {
    const bid = String(body.boutiqueId).trim();
    const exists = await prisma.boutique.findUnique({ where: { id: bid }, select: { id: true } });
    if (!exists) return NextResponse.json({ error: 'Boutique not found' }, { status: 400 });
    update.boutiqueId = bid;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  if (update.active === false) {
    await deactivateEmployeeCascade(empId);
  }

  const before = await prisma.employee.findUnique({
    where: { empId },
    select: { boutiqueId: true },
  });
  const employee = await prisma.employee.update({
    where: { empId },
    data: update,
  });
  if (update.boutiqueId && before?.boutiqueId !== update.boutiqueId) {
    await writeAdminAudit({
      actorUserId: session.id,
      action: 'EMPLOYEE_CHANGE_BOUTIQUE',
      entityType: 'Employee',
      entityId: empId,
      beforeJson: JSON.stringify({ boutiqueId: before?.boutiqueId }),
      afterJson: JSON.stringify({ boutiqueId: employee.boutiqueId }),
    });
  }
  const boutique = employee.boutiqueId
    ? await prisma.boutique.findUnique({
        where: { id: employee.boutiqueId },
        select: { id: true, code: true, name: true },
      })
    : null;
  return NextResponse.json({ ...employee, boutique });
}

export async function DELETE(request: NextRequest) {
  let session: { empId: string };
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
    return NextResponse.json({ error: 'Cannot delete your own employee record' }, { status: 400 });
  }

  const employee = await prisma.employee.findUnique({
    where: { empId, isSystemOnly: false },
    select: { empId: true, user: { select: { role: true } } },
  });
  if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
  if (employee.user?.role === 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Cannot delete employee linked to SUPER_ADMIN' }, { status: 403 });
  }

  await deactivateEmployeeCascade(empId);
  await prisma.user.updateMany({ where: { empId }, data: { disabled: true } });
  await prisma.employee.update({ where: { empId }, data: { active: false } });
  return NextResponse.json({ ok: true });
}
