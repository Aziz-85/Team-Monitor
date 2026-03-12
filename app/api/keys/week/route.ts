import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { getScheduleScope } from '@/lib/scope/scheduleScope';
import { getWeekKeyPlan, applyWeekKeyPlan, type DayKeyAssignment } from '@/lib/keys/keyService';
import { validateWeekKeyContinuity } from '@/lib/keys/keyContinuity';
import { computeSuggestionsAndWarnings } from '@/lib/keys/keySuggestions';
import { rosterForDate } from '@/lib/services/roster';
import { prisma } from '@/lib/db';
import type { Role } from '@prisma/client';

export const dynamic = 'force-dynamic';

const READ_ROLES: Role[] = ['EMPLOYEE', 'ASSISTANT_MANAGER', 'MANAGER', 'ADMIN', 'SUPER_ADMIN'];

/**
 * GET /api/keys/week?weekStart=YYYY-MM-DD&eligible=1
 * Returns key plan for the week: per-day AM/PM holders + current key holders.
 * If eligible=1, includes amEligible/pmEligible per day for dropdowns.
 */
export async function GET(request: NextRequest) {
  try {
    await requireRole(READ_ROLES);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const scope = await getScheduleScope(request);
  if (!scope?.boutiqueId) {
    return NextResponse.json(
      { error: 'Select a boutique in the scope selector.' },
      { status: 403 }
    );
  }

  const weekStart = request.nextUrl.searchParams.get('weekStart');
  if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    return NextResponse.json({ error: 'weekStart required (YYYY-MM-DD)' }, { status: 400 });
  }

  const plan = await getWeekKeyPlan(scope.boutiqueId, weekStart);
  const includeEligible = request.nextUrl.searchParams.get('eligible') === '1';
  if (!includeEligible) {
    return NextResponse.json({
      weekStart: plan.weekStart,
      days: plan.days,
      currentHolders: {
        key1HolderEmployeeId: plan.currentHolders.key1HolderEmployeeId,
        key2HolderEmployeeId: plan.currentHolders.key2HolderEmployeeId,
        key1HolderName: null,
        key2HolderName: null,
      },
    });
  }

  const boutiqueIds = [scope.boutiqueId];
  const daysWithEligible = await Promise.all(
    plan.days.map(async (day) => {
      const roster = await rosterForDate(new Date(day.date + 'T12:00:00Z'), { boutiqueIds });
      const dayOfWeek = new Date(day.date + 'T12:00:00Z').getUTCDay();
      const isFriday = dayOfWeek === 5;
      return {
        ...day,
        amEligible: isFriday
          ? roster.pmEmployees.map((e) => ({ empId: e.empId, name: e.name }))
          : roster.amEmployees.map((e) => ({ empId: e.empId, name: e.name })),
        pmEligible: roster.pmEmployees.map((e) => ({ empId: e.empId, name: e.name })),
      };
    })
  );

  const key1Name = plan.currentHolders.key1HolderEmployeeId
    ? (await prisma.employee.findUnique({ where: { empId: plan.currentHolders.key1HolderEmployeeId }, select: { name: true } }))?.name ?? null
    : null;
  const key2Name = plan.currentHolders.key2HolderEmployeeId
    ? (await prisma.employee.findUnique({ where: { empId: plan.currentHolders.key2HolderEmployeeId }, select: { name: true } }))?.name ?? null
    : null;

  const daysWithSuggestions = computeSuggestionsAndWarnings(daysWithEligible);

  return NextResponse.json({
    weekStart: plan.weekStart,
    days: daysWithSuggestions,
    currentHolders: {
      key1HolderEmployeeId: plan.currentHolders.key1HolderEmployeeId,
      key2HolderEmployeeId: plan.currentHolders.key2HolderEmployeeId,
      key1HolderName: key1Name,
      key2HolderName: key2Name,
    },
  });
}

const WRITE_ROLES: Role[] = ['ASSISTANT_MANAGER', 'MANAGER', 'ADMIN', 'SUPER_ADMIN'];

/**
 * POST /api/keys/week
 * Body: { weekStart: "YYYY-MM-DD", assignments: [{ date, amHolderEmpId, pmHolderEmpId }] }
 * Validates continuity, then replaces handovers in the week and creates new ones.
 */
export async function POST(request: NextRequest) {
  try {
    await requireRole(WRITE_ROLES);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const scope = await getScheduleScope(request);
  if (!scope?.boutiqueId) {
    return NextResponse.json(
      { error: 'Select a boutique in the scope selector.' },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const weekStart = String(body.weekStart ?? '').trim();
  if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    return NextResponse.json({ error: 'weekStart required (YYYY-MM-DD)' }, { status: 400 });
  }
  const raw = body.assignments;
  const assignmentList: DayKeyAssignment[] = Array.isArray(raw)
    ? raw
        .filter((a: unknown) => a && typeof a === 'object' && typeof (a as { date?: unknown }).date === 'string')
        .map((a: { date: string; amHolderEmpId?: string | null; pmHolderEmpId?: string | null }) => ({
          date: String((a as { date: string }).date).slice(0, 10),
          amHolderEmpId: a.amHolderEmpId != null ? String(a.amHolderEmpId) : null,
          pmHolderEmpId: a.pmHolderEmpId != null ? String(a.pmHolderEmpId) : null,
        }))
    : [];
  const byDate = new Map(assignmentList.map((a) => [a.date, a]));
  function addDays(dateStr: string, delta: number): string {
    const d = new Date(dateStr + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + delta);
    return d.toISOString().slice(0, 10);
  }
  const assignments: DayKeyAssignment[] = [];
  for (let i = 0; i < 7; i++) {
    const dateStr = addDays(weekStart, i);
    const existing = byDate.get(dateStr);
    assignments.push(
      existing ?? { date: dateStr, amHolderEmpId: null, pmHolderEmpId: null }
    );
  }

  const errors = await validateWeekKeyContinuity(scope.boutiqueId, weekStart, assignments);
  if (errors.length > 0) {
    return NextResponse.json(
      { error: errors[0].message, code: 'KEY_CONTINUITY', errors },
      { status: 400 }
    );
  }

  const { getSessionUser } = await import('@/lib/auth');
  const sessionUser = await getSessionUser();
  const createdByUserId = sessionUser?.id ?? 'system';
  const { created } = await applyWeekKeyPlan(scope.boutiqueId, weekStart, assignments, createdByUserId);
  return NextResponse.json({ ok: true, weekStart, created });
}
