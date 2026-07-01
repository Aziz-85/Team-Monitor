import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, requireRole } from '@/lib/auth';
import { getScheduleScope } from '@/lib/scope/scheduleScope';
import { canEditSchedule } from '@/lib/rbac/schedulePermissions';
import { getScheduleGridForWeek } from '@/lib/services/scheduleGrid';
import { loadFairnessContext } from '@/lib/services/schedulePlannerFairness';
import { buildSchedulePlanFromGenerate } from '@/lib/schedule/generateSchedule/planBridge';
import { planToAiContext } from '@/lib/services/schedulePlanner';
import { loadWeekGuestShifts } from '@/lib/services/schedulePlanGuests';
import { scheduleAssistantChat } from '@/lib/ai/scheduleAssistantChat';
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

  let body: {
    weekStart?: string;
    message?: string;
    scenarioId?: string;
    history?: Array<{ role: 'user' | 'assistant'; content: string }>;
    locale?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const weekStart = typeof body.weekStart === 'string' ? body.weekStart.trim().slice(0, 10) : '';
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const locale = body.locale === 'ar' ? 'ar' : 'en';

  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart) || !message) {
    return NextResponse.json({ error: 'weekStart and message required' }, { status: 400 });
  }

  const boutiqueIds = scheduleScope.boutiqueIds;
  const grid = await getScheduleGridForWeek(weekStart, { boutiqueIds });
  const [fairnessContext, guestShifts] = await Promise.all([
    loadFairnessContext(weekStart, grid.rows.map((r) => r.empId)),
    loadWeekGuestShifts(weekStart, boutiqueIds),
  ]);
  const { plan } = buildSchedulePlanFromGenerate(grid, fairnessContext, { guestShifts });
  const planContext = planToAiContext(plan, body.scenarioId);

  const result = await scheduleAssistantChat({
    locale,
    userMessage: message,
    history: Array.isArray(body.history) ? body.history : [],
    planContext,
  });

  return NextResponse.json(result);
}
