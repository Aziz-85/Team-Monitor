import { NextRequest, NextResponse } from 'next/server';
import { requireRole, getSessionUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';
import { getScheduleScope } from '@/lib/scope/scheduleScope';
import { getScheduleGridForWeek } from '@/lib/services/scheduleGrid';
import { buildScheduleSuggestions } from '@/lib/services/scheduleSuggestions';
import { canViewFullSchedule, canEditSchedule } from '@/lib/permissions';
import { prisma } from '@/lib/db';
import type { Role } from '@prisma/client';

/** Week range (Sat..Fri) for guest shift filter. hostBoutiqueId = scope; date in [first, last]. */
function weekStartToRange(weekStart: string): { first: Date; last: Date } {
  const first = new Date(weekStart + 'T00:00:00Z');
  const last = new Date(first);
  last.setUTCDate(last.getUTCDate() + 6);
  return { first, last };
}

const RIYADH_TZ = 'Asia/Riyadh';

/** Today's date in Asia/Riyadh (year 4-digit, month 1-12, day 1-31). */
function getTodayRiyadh(): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: RIYADH_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type: string) => parseInt(parts.find((p) => p.type === type)?.value ?? '0', 10);
  return { year: get('year'), month: get('month'), day: get('day') };
}

/** Unlock window: today is on/after 22nd of current month OR within last 7 days of current month (Riyadh). */
function isInUnlockWindowRiyadh(): boolean {
  const { year, month, day } = getTodayRiyadh();
  const lastDay = new Date(year, month + 1, 0).getDate(); // month 1-12 → last day of that month
  const inLast7 = day >= lastDay - 6;
  return day >= 22 || inLast7;
}

/** Week end (Friday) from Saturday weekStart (YYYY-MM-DD). */
function weekEndFromStart(weekStart: string): string {
  const d = new Date(weekStart + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 6);
  return d.toISOString().slice(0, 10);
}

/** YYYY-MM of next month in Riyadh (for comparison with week dates). */
function nextMonthStrRiyadh(year: number, month: number): string {
  if (month === 12) return `${year + 1}-01`;
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

/** Employee visibility: full current month always; next month only in unlock window. Uses Asia/Riyadh. */
function canEmployeeViewWeek(weekStart: string): { allowed: boolean; reason?: string } {
  const weekEnd = weekEndFromStart(weekStart);
  const { year, month } = getTodayRiyadh();
  const currentMonthPrefix = `${year}-${String(month).padStart(2, '0')}`;
  const firstDayCurrent = `${currentMonthPrefix}-01`;
  const nextMonthPrefix = nextMonthStrRiyadh(year, month);

  if (weekEnd < firstDayCurrent) {
    return { allowed: false, reason: 'This week is before your allowed view range (current month).' };
  }
  const weekDates = [weekStart];
  for (let i = 1; i <= 6; i++) {
    const d = new Date(weekStart + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + i);
    weekDates.push(d.toISOString().slice(0, 10));
  }
  const hasNextMonthDay = weekDates.some((dateStr) => dateStr.startsWith(nextMonthPrefix));
  if (hasNextMonthDay && !isInUnlockWindowRiyadh()) {
    return {
      allowed: false,
      reason: 'Next month schedule is visible only from the 22nd or the last 7 days of the current month.',
    };
  }
  return { allowed: true };
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
    const viewCheck = canEmployeeViewWeek(weekStart);
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
      OR: [
        { boutiqueId: { in: scheduleScope.boutiqueIds } },
        {
          boutiqueId: null,
          employee: {
            boutiqueId: { notIn: scheduleScope.boutiqueIds },
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
        (await prisma.employee.findMany({
          where: { empId: { in: pendingEmpIds }, active: true },
          select: {
            empId: true,
            name: true,
            boutiqueId: true,
            boutique: { select: { id: true, code: true, name: true } },
          },
        })).map((e) => [e.empId, e])
      )
    : new Map<string, { empId: string; name: string; boutiqueId: string; boutique: { id: string; code: string; name: string } | null }>();
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
        empId,
        boutiqueId: emp?.boutiqueId ?? '',
        homeBoutiqueCode: emp?.boutique?.code ?? '',
        homeBoutiqueName: emp?.boutique?.name ?? '',
      },
    };
  });
  (grid as Record<string, unknown>).pendingGuestShifts = pendingGuestShifts;

  return NextResponse.json(grid);
}
