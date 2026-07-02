import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, requireRole } from '@/lib/auth';
import { getScheduleScope } from '@/lib/scope/scheduleScope';
import { canEditSchedule } from '@/lib/rbac/schedulePermissions';
import {
  analyzeScheduleConstraints,
  mainConstraintReason,
  topConstraintRecommendation,
} from '@/lib/schedule/constraintAnalyzer';
import { loadGenerateScheduleInputForWeek } from '@/lib/schedule/loadScheduleEngineInput';
import { getSchedulePolicy } from '@/lib/schedule/policyEngine';
import { qualityPercentsFromAnalysis } from '@/lib/schedule/scheduleQuality';
import type { Role } from '@prisma/client';

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
    const { input, weekStart: resolvedWeek, guestShiftCount } = await loadGenerateScheduleInputForWeek(
      weekStart,
      scheduleScope.boutiqueIds
    );
    const analysis = analyzeScheduleConstraints(input);
    const policy = getSchedulePolicy(input);
    const qualityPercents = qualityPercentsFromAnalysis(analysis);

    return NextResponse.json({
      weekStart: resolvedWeek,
      guestShiftCount,
      analysis,
      policy,
      qualityPercents,
      mainReason: mainConstraintReason(analysis),
      recommendedFix: topConstraintRecommendation(analysis),
    });
  } catch (e) {
    console.error('[schedule/v3/analyze]', e);
    const message = e instanceof Error ? e.message : 'Failed to analyze schedule constraints';
    return NextResponse.json({ error: message + migrationHint(message) }, { status: 500 });
  }
}
