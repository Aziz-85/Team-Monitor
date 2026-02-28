/**
 * Cross-boutique guest coverage: shifts at host boutique by employees from other boutiques.
 * Uses ShiftOverride (boutiqueId = host, empId from any boutique). ADMIN/MANAGER only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { getScheduleScope } from '@/lib/scope/scheduleScope';
import { assertScheduleEditable, ScheduleLockedError } from '@/lib/guards/scheduleLockGuard';
import { applyOverrideChange } from '@/lib/services/scheduleApply';
import { isAmShiftForbiddenOnDate } from '@/lib/services/shift';
import { prisma } from '@/lib/db';
import type { Role } from '@prisma/client';

export const dynamic = 'force-dynamic';

const GUEST_ROLES: Role[] = ['ADMIN', 'MANAGER', 'ASSISTANT_MANAGER'];
const GUEST_SHIFTS = ['MORNING', 'EVENING'] as const;

function weekStartToRange(weekStart: string): { first: Date; last: Date } {
  const first = new Date(weekStart + 'T00:00:00Z');
  const last = new Date(first);
  last.setUTCDate(last.getUTCDate() + 6);
  return { first, last };
}

/** GET /api/schedule/guests?weekStart=YYYY-MM-DD — guest shifts for current host boutique in that week */
export async function GET(request: NextRequest) {
  try {
    await requireRole(GUEST_ROLES);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const scope = await getScheduleScope(request);
  if (!scope?.boutiqueId || !scope.boutiqueIds?.length) {
    return NextResponse.json({ error: 'No schedule scope' }, { status: 403 });
  }
  const weekStart = request.nextUrl.searchParams.get('weekStart');
  if (!weekStart) {
    return NextResponse.json({ error: 'weekStart required (YYYY-MM-DD)' }, { status: 400 });
  }
  const { first, last } = weekStartToRange(weekStart);

  // Include overrides where host = this scope, or boutiqueId null (legacy) with employee from another boutique.
  const overrides = await prisma.shiftOverride.findMany({
    where: {
      OR: [
        {
          boutiqueId: { in: scope.boutiqueIds },
          employee: {
            boutiqueId: { notIn: scope.boutiqueIds },
            active: true,
          },
        },
        {
          boutiqueId: null,
          employee: {
            boutiqueId: { notIn: scope.boutiqueIds },
            active: true,
          },
        },
      ],
      date: { gte: first, lte: last },
      isActive: true,
      overrideShift: { in: ['MORNING', 'EVENING'] },
      employee: { active: true },
    },
    select: {
      id: true,
      date: true,
      empId: true,
      overrideShift: true,
      reason: true,
      sourceBoutiqueId: true,
      employee: {
        select: {
          name: true,
          boutiqueId: true,
          boutique: { select: { id: true, code: true, name: true } },
        },
      },
    },
    orderBy: [{ date: 'asc' }, { empId: 'asc' }],
  });

  const guests = overrides.map((o) => {
    const sourceId = o.sourceBoutiqueId ?? o.employee.boutiqueId;
    const sourceBoutique = o.employee.boutique
      ? { id: o.employee.boutique.id, name: o.employee.boutique.name }
      : null;
    return {
      id: o.id,
      date: o.date.toISOString().slice(0, 10),
      empId: o.empId,
      shift: o.overrideShift,
      reason: o.reason ?? undefined,
      sourceBoutiqueId: sourceId,
      sourceBoutique,
      isExternal: true,
      employee: {
        name: o.employee.name,
        homeBoutiqueCode: o.employee.boutique?.code ?? '',
        homeBoutiqueName: o.employee.boutique?.name ?? '',
      },
    };
  });

  // Pending OVERRIDE_CREATE (e.g. added by ASSISTANT_MANAGER) — show in list until approved.
  const weekStartDate = new Date(weekStart + 'T00:00:00Z');
  const pendingRequests = await prisma.approvalRequest.findMany({
    where: {
      status: 'PENDING',
      module: 'SCHEDULE',
      actionType: 'OVERRIDE_CREATE',
      boutiqueId: { in: scope.boutiqueIds },
      weekStart: weekStartDate,
    },
    select: { id: true, payload: true },
    orderBy: { requestedAt: 'asc' },
  });
  const empIdsFromPending = Array.from(new Set(
    pendingRequests
      .map((r) => (r.payload as { empId?: string })?.empId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
  ));
  const employeesById = empIdsFromPending.length > 0
    ? new Map(
        (await prisma.employee.findMany({
          where: { empId: { in: empIdsFromPending }, active: true },
          select: {
            empId: true,
            name: true,
            boutiqueId: true,
            boutique: { select: { id: true, code: true, name: true } },
          },
        })).map((e) => [e.empId, e])
      )
    : new Map<string, { empId: string; name: string; boutiqueId: string; boutique: { id: string; code: string; name: string } | null }>();
  const pendingGuests = pendingRequests.map((req) => {
    const p = req.payload as { empId?: string; date?: string; overrideShift?: string; reason?: string; sourceBoutiqueId?: string };
    const empId = String(p?.empId ?? '');
    const dateStr = String(p?.date ?? '').slice(0, 10);
    const shift = (p?.overrideShift ?? 'MORNING').toUpperCase();
    const emp = employeesById.get(empId);
    const sourceBoutique = emp?.boutique ? { id: emp.boutique.id, name: emp.boutique.name } : null;
    return {
      id: `pending-${req.id}`,
      requestId: req.id,
      date: dateStr,
      empId,
      shift: shift === 'AM' ? 'MORNING' : shift === 'PM' ? 'EVENING' : shift,
      reason: p?.reason ?? undefined,
      sourceBoutiqueId: p?.sourceBoutiqueId ?? emp?.boutiqueId ?? '',
      sourceBoutique,
      isExternal: true,
      pending: true,
      employee: {
        name: emp?.name ?? empId,
        homeBoutiqueCode: emp?.boutique?.code ?? '',
        homeBoutiqueName: emp?.boutique?.name ?? '',
      },
    };
  });

  return NextResponse.json({ guests, pendingGuests, weekStart });
}

/** POST /api/schedule/guests — add/upsert guest shift. body: { date, employeeId (empId), shift (AM|PM|MORNING|EVENING), reason? } */
export async function POST(request: NextRequest) {
  let user: Awaited<ReturnType<typeof requireRole>> | null = null;
  try {
    user = await requireRole(GUEST_ROLES);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const scope = await getScheduleScope(request);
  if (!scope?.boutiqueId || !scope.boutiqueIds?.length) {
    return NextResponse.json({ error: 'No schedule scope' }, { status: 403 });
  }
  const hostBoutiqueId = scope.boutiqueId;

  let body: { date?: string; employeeId?: string; empId?: string; shift?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const dateStr = String(body.date ?? '').trim();
  const empId = String(body.employeeId ?? body.empId ?? '').trim();
  const shiftRaw = String(body.shift ?? '').toUpperCase();
  const reason = String(body.reason ?? '').trim();

  if (!dateStr || !empId) {
    return NextResponse.json({ error: 'date and employeeId (or empId) required' }, { status: 400 });
  }
  const overrideShift = shiftRaw === 'AM' ? 'MORNING' : shiftRaw === 'PM' ? 'EVENING' : shiftRaw;
  if (!GUEST_SHIFTS.includes(overrideShift as (typeof GUEST_SHIFTS)[number])) {
    return NextResponse.json({ error: 'shift must be AM, PM, MORNING, or EVENING' }, { status: 400 });
  }

  const emp = await prisma.employee.findFirst({
    where: { empId, active: true, isSystemOnly: false },
    select: { empId: true, boutiqueId: true },
  });
  if (!emp) {
    return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
  }

  try {
    await assertScheduleEditable({ dates: [dateStr], boutiqueId: hostBoutiqueId });
  } catch (e) {
    if (e instanceof ScheduleLockedError) {
      return NextResponse.json(
        { error: e.message, code: e.code },
        { status: 423 }
      );
    }
    throw e;
  }
  const date = new Date(dateStr + 'T00:00:00Z');
  if (isAmShiftForbiddenOnDate(date, 'MORNING')) {
    return NextResponse.json({ error: 'Friday AM not allowed', code: 'FRIDAY_PM_ONLY' }, { status: 400 });
  }

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const created = await applyOverrideChange(
    { empId, date: dateStr, overrideShift, reason: reason || 'Guest coverage' },
    user.id,
    { boutiqueId: hostBoutiqueId, sourceBoutiqueId: emp.boutiqueId }
  );
  return NextResponse.json(created);
}

/** DELETE /api/schedule/guests?id=... — remove guest shift (deactivate override) */
export async function DELETE(request: NextRequest) {
  try {
    await requireRole(GUEST_ROLES);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const scope = await getScheduleScope(request);
  if (!scope?.boutiqueIds?.length) {
    return NextResponse.json({ error: 'No schedule scope' }, { status: 403 });
  }
  const id = request.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 });
  }

  const override = await prisma.shiftOverride.findFirst({
    where: {
      id,
      boutiqueId: { in: scope.boutiqueIds },
      isActive: true,
    },
    select: { id: true, date: true },
  });
  if (!override) {
    return NextResponse.json({ error: 'Guest shift not found' }, { status: 404 });
  }

  await prisma.shiftOverride.update({
    where: { id },
    data: { isActive: false },
  });
  return NextResponse.json({ ok: true, id });
}
