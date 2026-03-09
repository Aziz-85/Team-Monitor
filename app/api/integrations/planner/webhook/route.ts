import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { processInboundEvent } from '@/lib/integrations/planner/inbound';
import type { InboundPlannerPayload } from '@/lib/integrations/planner/types';

const WEBHOOK_SECRET_HEADER = 'x-planner-webhook-secret';

export async function POST(request: NextRequest) {
  const secret = request.headers.get(WEBHOOK_SECRET_HEADER);
  let payload: InboundPlannerPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ ok: false, error: 'Payload must be an object' }, { status: 400 });
  }
  const taskId = payload.taskId ?? (payload as { raw?: { taskId?: string } }).raw?.taskId;
  if (!taskId || typeof taskId !== 'string') {
    return NextResponse.json({ ok: false, error: 'Missing or invalid taskId' }, { status: 400 });
  }
  if (payload.eventType !== undefined && typeof payload.eventType !== 'string') {
    return NextResponse.json({ ok: false, error: 'eventType must be a string' }, { status: 400 });
  }

  const integration = await prisma.plannerIntegration.findFirst({
    where: { enabled: true, mode: 'POWER_AUTOMATE', webhookSecret: { not: null } },
    select: { id: true, webhookSecret: true, boutiqueId: true },
  });

  if (!integration?.webhookSecret || secret !== integration.webhookSecret) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const result = await processInboundEvent(
    payload,
    integration.id,
    'POWER_AUTOMATE',
    integration.boutiqueId
  );

  return NextResponse.json({
    ok: true,
    processed: result.processed,
    created: result.created,
    updated: result.updated,
    skipped: result.skipped,
    errors: result.errors.length ? result.errors : undefined,
  });
}
