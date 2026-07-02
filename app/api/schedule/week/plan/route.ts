import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, requireRole } from '@/lib/auth';
import { getScheduleScope } from '@/lib/scope/scheduleScope';
import { canEditSchedule } from '@/lib/rbac/schedulePermissions';
import { getScheduleGridForWeek } from '@/lib/services/scheduleGrid';
import { loadFairnessContext } from '@/lib/services/schedulePlannerFairness';
import { buildSchedulePlanFromGenerate } from '@/lib/schedule/generateSchedule/planBridge';
import { loadWeekGuestShifts } from '@/lib/services/schedulePlanGuests';
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
    const t0 = Date.now();
    const grid = await getScheduleGridForWeek(weekStart, { boutiqueIds });
    const empIds = grid.rows.map((r) => r.empId);
    const [fairnessContext, guestShifts] = await Promise.all([
      loadFairnessContext(weekStart, empIds),
      loadWeekGuestShifts(weekStart, boutiqueIds),
    ]);
    const { plan, generateResult } = buildSchedulePlanFromGenerate(grid, fairnessContext, { guestShifts });

    if (process.env.NODE_ENV !== 'test') {
      console.log('[schedule/week/plan]', {
        weekStart,
        ms: Date.now() - t0,
        employees: empIds.length,
        actions: plan.scenarios[0]?.actions.length ?? 0,
        coverageValid: generateResult.coverageValid,
      });
    }

    return NextResponse.json({
      plan,
      coverageValid: generateResult.coverageValid,
      slotViolationCount: generateResult.slotViolations.length,
      fairnessScore: generateResult.fairnessScore,
      aiConfigured: Boolean(process.env.OPENAI_API_KEY?.trim()),
      guestShiftCount: guestShifts.length,
    });
  } catch (e) {
    console.error('[schedule/week/plan]', e);
    const message = e instanceof Error ? e.message : 'Failed to build schedule plan';
    const hint =
      message.includes('ShiftOverrideSegment') || message.includes('does not exist')
        ? ' Database migration may be pending — run: npx prisma migrate deploy'
        : '';
    return NextResponse.json({ error: message + hint }, { status: 500 });
  }
}
