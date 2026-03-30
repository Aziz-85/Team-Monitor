import { NextRequest, NextResponse } from 'next/server';
import { ingestPlannerTaskUpdate } from '@/lib/integrations/planner/taskUpdates';
import type { PlannerTaskUpdatePayload } from '@/lib/integrations/planner/normalizePlannerEvent';

const SECRET_HEADER = 'x-planner-secret';

function unauthorized() {
  return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
}

function badRequest(error: string) {
  return NextResponse.json({ ok: false, error }, { status: 400 });
}

export async function POST(request: NextRequest) {
  const expected = (process.env.PLANNER_WEBHOOK_SECRET ?? '').trim();
  const got = request.headers.get(SECRET_HEADER)?.trim() ?? '';
  if (!expected || got !== expected) return unauthorized();

  let body: PlannerTaskUpdatePayload;
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid JSON');
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return badRequest('Payload must be an object');
  }

  if (body.eventAt != null && typeof body.eventAt !== 'string') {
    return badRequest('eventAt must be a string');
  }
  if (body.notes != null && typeof body.notes !== 'string') {
    return badRequest('notes must be a string');
  }
  if (body.status != null && typeof body.status !== 'string') {
    return badRequest('status must be a string');
  }

  try {
    const result = await ingestPlannerTaskUpdate(body);
    return NextResponse.json({
      ok: true,
      parsed: {
        internalTaskKey: result.normalized.internalTaskKey,
        taskType: result.normalized.taskType,
        branchCode: result.normalized.branchCode,
        status: result.normalized.status,
        completedOnDateKey: result.normalized.completedOnDateKey,
      },
      saved: {
        eventId: result.event.id,
        completionSaved: result.completionSaved,
        completionId: result.completionId,
        normalizationSkippedReason: result.normalizationSkippedReason,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error';
    console.error('[planner-task-update] failed:', message);
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}

