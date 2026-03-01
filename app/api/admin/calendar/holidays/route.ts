/**
 * Admin Calendar: Official Holidays (Eid dates, etc.)
 * GET: list holidays for scope boutique
 * POST: create holiday. Body: { date: "YYYY-MM-DD", name: string }
 * PATCH: update. Body: { id, date?, name?, isClosed? }
 * PUT: update (same as PATCH). Body: { id, date?, name?, isClosed? }
 * DELETE: delete. Query: id=
 * RBAC: ADMIN, SUPER_ADMIN. Boutique-scoped via schedule scope.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getScheduleScope } from '@/lib/scope/scheduleScope';
import { prisma } from '@/lib/db';
import type { Role } from '@prisma/client';

const ADMIN_ROLES: Role[] = ['ADMIN', 'SUPER_ADMIN'];

async function requireAdminScope(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    throw { code: 'UNAUTHORIZED' as const };
  }
  const role = user.role as Role;
  if (!ADMIN_ROLES.includes(role)) {
    throw { code: 'FORBIDDEN' as const };
  }
  const scope = await getScheduleScope(request);
  if (!scope || !scope.boutiqueId || scope.boutiqueIds.length === 0) {
    return NextResponse.json(
      { error: 'Select a boutique in the scope selector.' },
      { status: 403 }
    );
  }
  return { user, scope };
}

export async function GET(request: NextRequest) {
  try {
    const result = await requireAdminScope(request);
    if (result instanceof NextResponse) return result;
    const { scope } = result;
    const list = await prisma.officialHoliday.findMany({
      where: { boutiqueId: scope.boutiqueId },
      orderBy: { date: 'asc' },
      select: { id: true, date: true, name: true, isClosed: true, createdAt: true },
    });
    return NextResponse.json(list);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (err.code === 'FORBIDDEN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    throw e;
  }
}

export async function POST(request: NextRequest) {
  try {
    const result = await requireAdminScope(request);
    if (result instanceof NextResponse) return result;
    const { scope } = result;
    const body = await request.json().catch(() => ({}));
    const date = typeof body.date === 'string' ? String(body.date).slice(0, 10) : '';
    const name = typeof body.name === 'string' ? String(body.name).trim() : '';
    const isClosed = body.isClosed === false ? false : true;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !name) {
      return NextResponse.json(
        { error: 'Body must include date (YYYY-MM-DD) and name' },
        { status: 400 }
      );
    }
    const created = await prisma.officialHoliday.create({
      data: { boutiqueId: scope.boutiqueId, date, name, isClosed },
      select: { id: true, date: true, name: true, isClosed: true, createdAt: true },
    });
    return NextResponse.json(created);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (err.code === 'FORBIDDEN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if ((e as { code?: string }).code === 'P2002') {
      return NextResponse.json({ error: 'A holiday already exists for this date' }, { status: 409 });
    }
    throw e;
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const result = await requireAdminScope(request);
    if (result instanceof NextResponse) return result;
    const { scope } = result;
    const body = await request.json().catch(() => ({}));
    const id = typeof body.id === 'string' ? body.id : '';
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    const existing = await prisma.officialHoliday.findFirst({
      where: { id, boutiqueId: scope.boutiqueId },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: 'Holiday not found' }, { status: 404 });
    const update: { date?: string; name?: string; isClosed?: boolean } = {};
    if (typeof body.date === 'string') update.date = String(body.date).slice(0, 10);
    if (typeof body.name === 'string') update.name = String(body.name).trim();
    if (typeof body.isClosed === 'boolean') update.isClosed = body.isClosed;
    if (Object.keys(update).length === 0) {
      const current = await prisma.officialHoliday.findUnique({ where: { id }, select: { id: true, date: true, name: true, isClosed: true, createdAt: true } });
      return NextResponse.json(current);
    }
    if (update.date && !/^\d{4}-\d{2}-\d{2}$/.test(update.date)) {
      return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
    }
    const updated = await prisma.officialHoliday.update({
      where: { id },
      data: update,
      select: { id: true, date: true, name: true, isClosed: true, createdAt: true },
    });
    return NextResponse.json(updated);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (err.code === 'FORBIDDEN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if ((e as { code?: string }).code === 'P2002') {
      return NextResponse.json({ error: 'A holiday already exists for this date' }, { status: 409 });
    }
    throw e;
  }
}

export async function PUT(request: NextRequest) {
  return PATCH(request);
}

export async function DELETE(request: NextRequest) {
  try {
    const result = await requireAdminScope(request);
    if (result instanceof NextResponse) return result;
    const { scope } = result;
    const id = request.nextUrl.searchParams.get('id')?.trim();
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    const existing = await prisma.officialHoliday.findFirst({
      where: { id, boutiqueId: scope.boutiqueId },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: 'Holiday not found' }, { status: 404 });
    await prisma.officialHoliday.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (err.code === 'FORBIDDEN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    throw e;
  }
}
