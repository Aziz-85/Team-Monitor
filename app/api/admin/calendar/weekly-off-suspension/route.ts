/**
 * Admin Calendar: Weekly Off Suspension Periods (e.g. Ramadan last 10 days)
 * GET: list for scope boutique
 * POST: create. Body: { name, startDate: "YYYY-MM-DD", endDate: "YYYY-MM-DD" }
 * PATCH: update. Body: { id, name?, startDate?, endDate? }
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

const ymd = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(String(s).slice(0, 10));

export async function GET(request: NextRequest) {
  try {
    const result = await requireAdminScope(request);
    if (result instanceof NextResponse) return result;
    const { scope } = result;
    const list = await prisma.weeklyOffSuspensionPeriod.findMany({
      where: { boutiqueId: scope.boutiqueId },
      orderBy: { startDate: 'asc' },
      select: { id: true, name: true, startDate: true, endDate: true, createdAt: true },
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
    const name = typeof body.name === 'string' ? String(body.name).trim() : '';
    const startDate = typeof body.startDate === 'string' ? String(body.startDate).slice(0, 10) : '';
    const endDate = typeof body.endDate === 'string' ? String(body.endDate).slice(0, 10) : '';
    if (!ymd(startDate) || !ymd(endDate) || !name) {
      return NextResponse.json(
        { error: 'Body must include name, startDate (YYYY-MM-DD), and endDate (YYYY-MM-DD)' },
        { status: 400 }
      );
    }
    if (startDate > endDate) {
      return NextResponse.json({ error: 'startDate must be <= endDate' }, { status: 400 });
    }
    const created = await prisma.weeklyOffSuspensionPeriod.create({
      data: { boutiqueId: scope.boutiqueId, name, startDate, endDate },
      select: { id: true, name: true, startDate: true, endDate: true, createdAt: true },
    });
    return NextResponse.json(created);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (err.code === 'FORBIDDEN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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
    const existing = await prisma.weeklyOffSuspensionPeriod.findFirst({
      where: { id, boutiqueId: scope.boutiqueId },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: 'Period not found' }, { status: 404 });
    const update: { name?: string; startDate?: string; endDate?: string } = {};
    if (typeof body.name === 'string') update.name = String(body.name).trim();
    if (typeof body.startDate === 'string') update.startDate = String(body.startDate).slice(0, 10);
    if (typeof body.endDate === 'string') update.endDate = String(body.endDate).slice(0, 10);
    if (Object.keys(update).length === 0) {
      const current = await prisma.weeklyOffSuspensionPeriod.findUnique({
        where: { id },
        select: { id: true, name: true, startDate: true, endDate: true, createdAt: true },
      });
      return NextResponse.json(current);
    }
    if (update.startDate && !ymd(update.startDate)) {
      return NextResponse.json({ error: 'startDate must be YYYY-MM-DD' }, { status: 400 });
    }
    if (update.endDate && !ymd(update.endDate)) {
      return NextResponse.json({ error: 'endDate must be YYYY-MM-DD' }, { status: 400 });
    }
    const updated = await prisma.weeklyOffSuspensionPeriod.update({
      where: { id },
      data: update,
      select: { id: true, name: true, startDate: true, endDate: true, createdAt: true },
    });
    if (updated.startDate > updated.endDate) {
      return NextResponse.json({ error: 'startDate must be <= endDate' }, { status: 400 });
    }
    return NextResponse.json(updated);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (err.code === 'FORBIDDEN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    throw e;
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const result = await requireAdminScope(request);
    if (result instanceof NextResponse) return result;
    const { scope } = result;
    const id = request.nextUrl.searchParams.get('id')?.trim();
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    const existing = await prisma.weeklyOffSuspensionPeriod.findFirst({
      where: { id, boutiqueId: scope.boutiqueId },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: 'Period not found' }, { status: 404 });
    await prisma.weeklyOffSuspensionPeriod.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (err.code === 'FORBIDDEN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    throw e;
  }
}
