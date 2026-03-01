/**
 * Admin: Employee Day Override (per-date FORCE_WORK / FORCE_OFF)
 * GET: list overrides. Query: boutiqueId=, employeeId=?, date=?, from=?, to=?
 * POST: create/upsert. Body: { boutiqueId, employeeId, date: "YYYY-MM-DD", mode: "FORCE_WORK"|"FORCE_OFF", reason? }
 * DELETE: remove override. Query: id= (or boutiqueId, employeeId, date)
 * RBAC: ADMIN, SUPER_ADMIN. Boutique-scoped.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getScheduleScope } from '@/lib/scope/scheduleScope';
import { prisma } from '@/lib/db';
import type { Role } from '@prisma/client';
import type { DayOverrideMode } from '@prisma/client';

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

const YMD = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(String(s).slice(0, 10));
const MODES: DayOverrideMode[] = ['FORCE_WORK', 'FORCE_OFF'];

export async function GET(request: NextRequest) {
  try {
    const result = await requireAdminScope(request);
    if (result instanceof NextResponse) return result;
    const { scope } = result;
    const boutiqueId = request.nextUrl.searchParams.get('boutiqueId')?.trim() || scope.boutiqueId;
    if (boutiqueId !== scope.boutiqueId) {
      return NextResponse.json({ error: 'Forbidden: boutique not in scope' }, { status: 403 });
    }
    const employeeId = request.nextUrl.searchParams.get('employeeId')?.trim();
    const date = request.nextUrl.searchParams.get('date')?.trim().slice(0, 10);
    const from = request.nextUrl.searchParams.get('from')?.trim().slice(0, 10);
    const to = request.nextUrl.searchParams.get('to')?.trim().slice(0, 10);

    type Where = { boutiqueId: string; employeeId?: string; date?: string | { gte: string; lte: string } };
    const where: Where = { boutiqueId };
    if (employeeId) where.employeeId = employeeId;
    if (date && YMD(date)) where.date = date;
    if (from && YMD(from) && to && YMD(to)) {
      where.date = { gte: from, lte: to };
    }

    const list = await prisma.employeeDayOverride.findMany({
      where,
      orderBy: [{ date: 'asc' }, { employeeId: 'asc' }],
      select: { id: true, employeeId: true, date: true, mode: true, reason: true, createdAt: true },
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
    const boutiqueId = typeof body.boutiqueId === 'string' ? body.boutiqueId.trim() : scope.boutiqueId;
    const employeeId = typeof body.employeeId === 'string' ? body.employeeId.trim() : '';
    const date = typeof body.date === 'string' ? String(body.date).slice(0, 10) : '';
    const mode = (typeof body.mode === 'string' ? body.mode : '') as DayOverrideMode;
    const reason = typeof body.reason === 'string' ? body.reason.trim() : null;

    if (boutiqueId !== scope.boutiqueId) {
      return NextResponse.json({ error: 'Forbidden: boutique not in scope' }, { status: 403 });
    }
    if (!YMD(date) || !employeeId || !MODES.includes(mode)) {
      return NextResponse.json(
        { error: 'Body must include boutiqueId (or use scope), employeeId, date (YYYY-MM-DD), and mode (FORCE_WORK or FORCE_OFF)' },
        { status: 400 }
      );
    }

    const emp = await prisma.employee.findFirst({
      where: { empId: employeeId, boutiqueId, active: true },
      select: { empId: true },
    });
    if (!emp) {
      return NextResponse.json({ error: 'Employee not found or not in this boutique' }, { status: 404 });
    }

    const created = await prisma.employeeDayOverride.upsert({
      where: {
        boutiqueId_employeeId_date: { boutiqueId, employeeId, date },
      },
      create: { boutiqueId, employeeId, date, mode, reason },
      update: { mode, reason },
      select: { id: true, employeeId: true, date: true, mode: true, reason: true, createdAt: true },
    });
    return NextResponse.json(created);
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
    const boutiqueId = request.nextUrl.searchParams.get('boutiqueId')?.trim();
    const employeeId = request.nextUrl.searchParams.get('employeeId')?.trim();
    const date = request.nextUrl.searchParams.get('date')?.trim().slice(0, 10);

    if (id) {
      const existing = await prisma.employeeDayOverride.findFirst({
        where: { id, boutiqueId: scope.boutiqueId },
        select: { id: true },
      });
      if (!existing) return NextResponse.json({ error: 'Override not found' }, { status: 404 });
      await prisma.employeeDayOverride.delete({ where: { id } });
      return NextResponse.json({ ok: true });
    }
    if (boutiqueId === scope.boutiqueId && employeeId && date && YMD(date)) {
      const deleted = await prisma.employeeDayOverride.deleteMany({
        where: { boutiqueId: scope.boutiqueId, employeeId, date },
      });
      return NextResponse.json({ ok: true, deleted: deleted.count });
    }
    return NextResponse.json(
      { error: 'Provide id= or boutiqueId=, employeeId=, and date= (YYYY-MM-DD)' },
      { status: 400 }
    );
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (err.code === 'FORBIDDEN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if ((e as { code?: string }).code === 'P2025') {
      return NextResponse.json({ error: 'Override not found' }, { status: 404 });
    }
    throw e;
  }
}
