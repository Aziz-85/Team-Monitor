import { NextRequest, NextResponse } from 'next/server';
import { requireRole, getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { requireOperationalBoutique } from '@/lib/scope/requireOperationalBoutique';
import type { Role } from '@prisma/client';

const managerRoles: Role[] = ['MANAGER', 'ADMIN'];

function parseDate(dateStr: string): Date {
  return new Date(dateStr + 'T00:00:00Z');
}

export async function GET(request: NextRequest) {
  try {
    await requireRole([...managerRoles, 'EMPLOYEE'] as Role[]);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const scopeResult = await requireOperationalBoutique(request);
  if (!scopeResult.ok) return scopeResult.res;
  const { boutiqueId } = scopeResult;

  const dateParam = request.nextUrl.searchParams.get('date');
  if (!dateParam) {
    return NextResponse.json({ error: 'date required (YYYY-MM-DD)' }, { status: 400 });
  }
  const date = parseDate(dateParam);
  if (Number.isNaN(date.getTime())) {
    return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
  }

  const absents = await prisma.inventoryAbsent.findMany({
    where: { boutiqueId, date },
    include: {
      createdByUser: {
        select: {
          id: true,
          empId: true,
          employee: { select: { name: true } },
        },
      },
    },
  });
  const empIds = Array.from(new Set(absents.map((a) => a.empId)));
  const employees = await prisma.employee.findMany({
    where: { boutiqueId, empId: { in: empIds } },
    select: { empId: true, name: true },
  });
  const nameByEmp = new Map(employees.map((e) => [e.empId, e.name]));

  const list = absents.map((a) => ({
      id: a.id,
      date: dateParam,
      empId: a.empId,
      empName: nameByEmp.get(a.empId) ?? a.empId,
      reason: a.reason,
      createdByUserId: a.createdByUserId,
      createdByName: a.createdByUser.employee?.name ?? a.createdByUser.empId,
      createdAt: a.createdAt,
    }));

  return NextResponse.json({ date: dateParam, absents: list });
}

export async function POST(request: NextRequest) {
  let user: Awaited<ReturnType<typeof getSessionUser>>;
  try {
    user = await requireRole(managerRoles);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { date?: string; empId?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const { date: dateStr, empId, reason } = body;
  if (!dateStr || !empId) {
    return NextResponse.json({ error: 'date and empId required' }, { status: 400 });
  }
  const date = parseDate(dateStr);
  if (Number.isNaN(date.getTime())) {
    return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
  }

  const scopeResult = await requireOperationalBoutique(request);
  if (!scopeResult.ok) return scopeResult.res;
  const { boutiqueId } = scopeResult;

  const existing = await prisma.employee.findFirst({
    where: { boutiqueId, empId },
  });
  if (!existing) {
    return NextResponse.json({ error: 'Employee not found or not in your operational boutique' }, { status: 404 });
  }

  const created = await prisma.inventoryAbsent.upsert({
    where: {
      boutiqueId_date_empId: { boutiqueId, date, empId },
    },
    create: {
      boutiqueId,
      date,
      empId,
      reason: reason ?? null,
      createdByUserId: user.id,
    },
    update: {
      reason: reason ?? undefined,
    },
  });

  return NextResponse.json({
    id: created.id,
    date: dateStr,
    empId: created.empId,
    reason: created.reason,
    createdByUserId: created.createdByUserId,
    createdAt: created.createdAt,
  });
}

export async function DELETE(request: NextRequest) {
  try {
    await requireRole(managerRoles);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const scopeResult = await requireOperationalBoutique(request);
  if (!scopeResult.ok) return scopeResult.res;
  const { boutiqueId } = scopeResult;

  const id = request.nextUrl.searchParams.get('id');
  const dateParam = request.nextUrl.searchParams.get('date');
  const empId = request.nextUrl.searchParams.get('empId');

  if (id) {
    await prisma.inventoryAbsent.deleteMany({ where: { id, boutiqueId } });
    return NextResponse.json({ ok: true, deleted: id });
  }
  if (dateParam && empId) {
    const date = parseDate(dateParam);
    if (Number.isNaN(date.getTime())) {
      return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
    }
    await prisma.inventoryAbsent.deleteMany({
      where: { boutiqueId, date, empId },
    });
    return NextResponse.json({ ok: true, deleted: { date: dateParam, empId } });
  }

  return NextResponse.json({ error: 'Provide id or (date and empId)' }, { status: 400 });
}
