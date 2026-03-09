import { NextRequest, NextResponse } from 'next/server';
import { requirePlannerIntegrationAccess } from '@/lib/integrations/planner/permissions';
import { handleAdminError } from '@/lib/admin/requireAdmin';
import { normalizeInboundPayload } from '@/lib/integrations/planner/normalize';
import { buildEventHash } from '@/lib/integrations/planner/hash';
import type { InboundPlannerPayload } from '@/lib/integrations/planner/types';

export async function POST(request: NextRequest) {
  try {
    await requirePlannerIntegrationAccess();
  } catch (e) {
    return handleAdminError(e);
  }

  let payload: InboundPlannerPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const normalized = normalizeInboundPayload(payload);
  const hash = buildEventHash(payload);

  return NextResponse.json({
    ok: true,
    dryRun: true,
    eventType: payload.eventType,
    eventHash: hash,
    normalized: normalized
      ? {
          externalTaskId: normalized.externalTaskId,
          title: normalized.title,
          isCompleted: normalized.isCompleted,
          dueDate: normalized.dueDate,
          assignedEmails: normalized.assignedEmails,
        }
      : null,
    parseError: normalized ? null : 'Missing taskId or invalid payload',
  });
}
