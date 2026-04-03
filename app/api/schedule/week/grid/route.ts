import { NextRequest, NextResponse } from 'next/server';
import { requireRole, getSessionUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';
import { getScheduleScope } from '@/lib/scope/scheduleScope';
import { getScheduleGridForWeek } from '@/lib/services/scheduleGrid';
import { buildScheduleSuggestions } from '@/lib/services/scheduleSuggestions';
import { canViewFullSchedule, canEditSchedule } from '@/lib/permissions';
import { prisma } from '@/lib/db';
import { filterOperationalEmployees } from '@/lib/systemUsers';
import { compDayBalanceForBoutique } from '@/lib/schedule/dayOverride';
import { getScheduleEmployeeWeekVisibility } from '@/lib/time';
import type { Role } from '@prisma/client';

/** Week range (Sat..Fri) for guest shift filter. hostBoutiqueId = scope; date in [first, last]. */
function weekStartToRange(weekStart: string): { first: Date; last: Date } {
  const first = new Date(weekStart + 'T00:00:00Z');
  const last = new Date(first);
  last.setUTCDate(last.getUTCDate() + 6);
  return { first, last };
}

export async function GET(request: NextRequest) {
  let user: Awaited<ReturnType<typeof getSessionUser>>;
  try {
    user = await requireRole(['MANAGER', 'ASSISTANT_MANAGER', 'ADMIN', 'EMPLOYEE'] as Role[]);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const weekStart = request.nextUrl.searchParams.get('weekStart');
  if (!weekStart) {
    return NextResponse.json({ error: 'weekStart required (YYYY-MM-DD)' }, { status: 400 });
  }

  const scheduleScope = await getScheduleScope(request);
  if (!scheduleScope || scheduleScope.boutiqueIds.length === 0) {
    return NextResponse.json(
      { error: 'Select a boutique in the scope selector.' },
      { status: 403 }
    );
  }

  const scope = request.nextUrl.searchParams.get('scope');
  const team = request.nextUrl.searchParams.get('team');
  const options: { empId?: string; team?: string; boutiqueIds: string[] } = {
    boutiqueIds: scheduleScope.boutiqueIds,
  };
  if (!canViewFullSchedule(user!.role)) {
    const viewCheck = getScheduleEmployeeWeekVisibility(weekStart);
    if (!viewCheck.allowed) {
      return NextResponse.json({ error: viewCheck.reason ?? 'This week is not in your allowed view range.' }, { status: 403 });
    }
  } else {
    if (scope === 'me' && user?.empId) options.empId = user.empId;
    if (team === 'A' || team === 'B') options.team = team;
  }

  const grid = await getScheduleGridForWeek(weekStart, options);
  if (canEditSchedule(user!.role) && request.nextUrl.searchParams.get('suggestions') === '1') {
    (grid as Record<string, unknown>).suggestions = buildScheduleSuggestions(grid);
  }

  const { first, last } = weekStartToRange(weekStart);
  const scopeSet = new Set(scheduleScope.boutiqueIds);
  // Guest shifts: host boutique = current scope, or boutiqueId null (legacy) with employee from another boutique.
  const guestOverrides = await prisma.shiftOverride.findMany({
    where: {
      // STRICT: operational schedule view is host-boutique only.
      // Do not include legacy boutiqueId=null overrides here; they have no host boutique and can leak cross-boutique data.
      boutiqueId: { in: scheduleScope.boutiqueIds },
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
          nameAr: true,
          empId: true,
          boutiqueId: true,
          boutique: { select: { id: true, code: true, name: true } },
        },
      },
    },
    orderBy: [{ date: 'asc' }, { empId: 'asc' }],
  });
  const guestShifts = guestOverrides.map((o) => {
    const sourceId = o.sourceBoutiqueId ?? o.employee.boutiqueId;
    const sourceBoutique = o.employee.boutique
      ? { id: o.employee.boutique.id, name: o.employee.boutique.name }
      : null;
    const isExternal = !scopeSet.has(o.employee.boutiqueId);
    return {
      id: o.id,
      date: o.date.toISOString().slice(0, 10),
      employeeId: o.empId,
      empId: o.empId,
      shift: o.overrideShift,
      reason: o.reason ?? undefined,
      sourceBoutiqueId: sourceId,
      sourceBoutique,
      /** true = from another boutique (show in External Coverage); false = same branch */
      isExternal,
      employee: {
        name: o.employee.name,
        nameAr: o.employee.nameAr ?? null,
        empId: o.employee.empId,
        boutiqueId: o.employee.boutiqueId,
        homeBoutiqueCode: o.employee.boutique?.code ?? '',
        homeBoutiqueName: o.employee.boutique?.name ?? '',
      },
    };
  });
  (grid as Record<string, unknown>).guestShifts = guestShifts;

  // Pending OVERRIDE_CREATE (e.g. by ASSISTANT_MANAGER) — show in grid until approved.
  const weekStartDate = new Date(weekStart + 'T00:00:00Z');
  const pendingRequests = await prisma.approvalRequest.findMany({
    where: {
      status: 'PENDING',
      module: 'SCHEDULE',
      actionType: 'OVERRIDE_CREATE',
      boutiqueId: { in: scheduleScope.boutiqueIds },
      weekStart: weekStartDate,
    },
    select: { id: true, payload: true },
    orderBy: { requestedAt: 'asc' },
  });
  const pendingEmpIds = Array.from(new Set(
    pendingRequests
      .map((r) => (r.payload as { empId?: string })?.empId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
  ));
  const pendingEmployees = pendingEmpIds.length > 0
    ? new Map(
        filterOperationalEmployees(
          await prisma.employee.findMany({
            where: { empId: { in: pendingEmpIds }, active: true },
            select: {
              empId: true,
              name: true,
              nameAr: true,
              boutiqueId: true,
              isSystemOnly: true,
              boutique: { select: { id: true, code: true, name: true } },
            },
          })
        ).map((e) => [e.empId, e])
      )
    : new Map<string, { empId: string; name: string; nameAr?: string | null; boutiqueId: string; boutique: { id: string; code: string; name: string } | null }>();
  const pendingGuestShifts = pendingRequests.map((req) => {
    const p = req.payload as { empId?: string; date?: string; overrideShift?: string; reason?: string; sourceBoutiqueId?: string };
    const empId = String(p?.empId ?? '');
    const dateStr = String(p?.date ?? '').slice(0, 10);
    const shift = (p?.overrideShift ?? 'MORNING').toUpperCase();
    const s = shift === 'AM' ? 'MORNING' : shift === 'PM' ? 'EVENING' : shift;
    const emp = pendingEmployees.get(empId);
    const sourceBoutique = emp?.boutique ? { id: emp.boutique.id, name: emp.boutique.name } : null;
    return {
      id: `pending-${req.id}`,
      requestId: req.id,
      date: dateStr,
      empId,
      shift: s,
      reason: p?.reason ?? undefined,
      sourceBoutiqueId: p?.sourceBoutiqueId ?? emp?.boutiqueId ?? '',
      sourceBoutique,
      isExternal: true,
      pending: true,
      employee: {
        name: emp?.name ?? empId,
        nameAr: emp?.nameAr ?? null,
        empId,
        boutiqueId: emp?.boutiqueId ?? '',
        homeBoutiqueCode: emp?.boutique?.code ?? '',
        homeBoutiqueName: emp?.boutique?.name ?? '',
      },
    };
  });
  (grid as Record<string, unknown>).pendingGuestShifts = pendingGuestShifts;

  if ((user!.role as Role) === 'ADMIN' || (user!.role as string) === 'SUPER_ADMIN') {
    const boutiqueId = scheduleScope.boutiqueIds[0];
    if (boutiqueId && Array.isArray((grid as { rows?: { empId: string }[] }).rows)) {
      const empIds = (grid as { rows: { empId: string }[] }).rows.map((r) => r.empId);
      const compBalanceByEmpId: Record<string, number> = {};
      for (const empId of empIds) {
        compBalanceByEmpId[empId] = await compDayBalanceForBoutique(boutiqueId, empId);
      }
      (grid as Record<string, unknown>).compBalanceByEmpId = compBalanceByEmpId;
    }
  }

  return NextResponse.json(grid);
}
