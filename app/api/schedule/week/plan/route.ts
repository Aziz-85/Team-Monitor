import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, requireRole } from '@/lib/auth';
import { getScheduleScope } from '@/lib/scope/scheduleScope';
import { canEditSchedule } from '@/lib/rbac/schedulePermissions';
import { getScheduleGridForWeek } from '@/lib/services/scheduleGrid';
import { loadFairnessContext } from '@/lib/services/schedulePlannerFairness';
import { buildSchedulePlan } from '@/lib/services/schedulePlanner';
import { loadExternalCandidates, loadWeekGuestShifts } from '@/lib/services/schedulePlanGuests';
import type { Role } from '@prisma/client';

const EDIT_ROLES: Role[] = ['MANAGER', 'ASSISTANT_MANAGER', 'ADMIN', 'SUPER_ADMIN'];

export async function POST(request: NextRequest) {
  let user: Awaited<ReturnType<typeof getSessionUser>>;
  try {
    user = await requireRole(EDIT_ROLES);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!user || !canEditSchedule(user)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const scheduleScope = await getScheduleScope(request);
  if (!scheduleScope?.boutiqueId) {
    return NextResponse.json({ error: 'No schedule scope' }, { status: 403 });
  }

  let body: { weekStart?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const weekStart = typeof body.weekStart === 'string' ? body.weekStart.trim().slice(0, 10) : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    return NextResponse.json({ error: 'weekStart required (YYYY-MM-DD)' }, { status: 400 });
  }

  try {
    const boutiqueIds = scheduleScope.boutiqueIds;
    const grid = await getScheduleGridForWeek(weekStart, { boutiqueIds });
    const empIds = grid.rows.map((r) => r.empId);
    const [fairnessContext, guestShifts, externalCandidates] = await Promise.all([
      loadFairnessContext(weekStart, empIds),
      loadWeekGuestShifts(weekStart, boutiqueIds),
      loadExternalCandidates(boutiqueIds),
    ]);
    const plan = buildSchedulePlan(grid, fairnessContext, { guestShifts, externalCandidates });

    return NextResponse.json({
      plan,
      aiConfigured: Boolean(process.env.OPENAI_API_KEY?.trim()),
      externalCandidateCount: externalCandidates.length,
      guestShiftCount: guestShifts.length,
    });
  } catch (e) {
    console.error('[schedule/week/plan]', e);
    const message = e instanceof Error ? e.message : 'Failed to build schedule plan';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
