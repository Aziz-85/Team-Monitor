import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, requireRole } from '@/lib/auth';
import { getScheduleScope } from '@/lib/scope/scheduleScope';
import { canEditSchedule } from '@/lib/rbac/schedulePermissions';
import { loadGenerateScheduleInputForWeek } from '@/lib/schedule/loadScheduleEngineInput';
import {
  simulateScheduleScenarios,
  DEFAULT_MAX_SCENARIOS,
  DEFAULT_MAX_SCENARIO_SOLVE_MS,
  HARD_MAX_SOLVES,
} from '@/lib/schedule/scenarioSimulator';
import type { Role } from '@prisma/client';

/** Scenario simulation runs several solves; allow generous headroom on VPS. */
export const maxDuration = 120;

const EDIT_ROLES: Role[] = ['MANAGER', 'ASSISTANT_MANAGER', 'ADMIN', 'SUPER_ADMIN'];

function migrationHint(message: string): string {
  if (message.includes('ShiftOverrideSegment') || message.includes('does not exist')) {
    return ' Database migration may be pending — run: npx prisma migrate deploy';
  }
  return '';
}

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

  let body: { weekStart?: string; maxScenarios?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const weekStart = typeof body.weekStart === 'string' ? body.weekStart.trim().slice(0, 10) : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    return NextResponse.json({ error: 'weekStart required (YYYY-MM-DD)' }, { status: 400 });
  }

  const maxScenarios =
    typeof body.maxScenarios === 'number' && Number.isFinite(body.maxScenarios)
      ? Math.max(1, Math.min(Math.floor(body.maxScenarios), DEFAULT_MAX_SCENARIOS + 3))
      : DEFAULT_MAX_SCENARIOS;

  try {
    const { input, weekStart: resolvedWeek } = await loadGenerateScheduleInputForWeek(
      weekStart,
      scheduleScope.boutiqueIds
    );

    const output = simulateScheduleScenarios(input, {
      maxScenarios,
      maxScenarioSolveMs: DEFAULT_MAX_SCENARIO_SOLVE_MS,
      maxSolves: HARD_MAX_SOLVES,
      forcePartialSolve: true,
    });

    return NextResponse.json({
      weekStart: resolvedWeek,
      bestScenarioId: output.bestScenarioId,
      scenarios: output.scenarios,
      summary: output.summary,
      generatedAt: new Date().toISOString(),
      performance: output.performance,
    });
  } catch (e) {
    console.error('[schedule/v3/scenarios]', e);
    const message = e instanceof Error ? e.message : 'Failed to simulate scenarios';
    return NextResponse.json({ error: message + migrationHint(message) }, { status: 500 });
  }
}
