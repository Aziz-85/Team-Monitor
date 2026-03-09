/**
 * Process inbound Power Automate / webhook payloads.
 * Idempotent; never bypass RBAC or boutique scope.
 */

import { prisma } from '@/lib/db';
import { buildEventHash } from './hash';
import { normalizeInboundPayload } from './normalize';
import { resolveEmployeeIdFromMicrosoft } from './mappers';
import type { InboundPlannerPayload } from './types';
import type { PlannerIntegrationMode } from './types';

export type InboundResult = {
  processed: boolean;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
};

export async function processInboundEvent(
  payload: InboundPlannerPayload,
  integrationId: string | null,
  sourceMode: PlannerIntegrationMode,
  boutiqueId: string | null
): Promise<InboundResult> {
  const eventHash = buildEventHash(payload);
  const eventType = payload.eventType ?? 'unknown';

  const existing = await prisma.plannerInboundEvent.findUnique({
    where: { eventHash },
    select: { id: true, processed: true },
  });
  if (existing?.processed) {
    return { processed: false, created: 0, updated: 0, skipped: 1, errors: [] };
  }

  const logInbound = async (opts: {
    relatedLocalTaskId?: string | null;
    relatedExternalTaskId?: string | null;
    status: 'SUCCESS' | 'ERROR' | 'SKIPPED';
    message?: string | null;
    requestPayload?: object | null;
  }) => {
    await prisma.plannerSyncLog.create({
      data: {
        integrationId,
        direction: 'INBOUND',
        mode: sourceMode,
        eventType,
        status: opts.status,
        relatedLocalTaskId: opts.relatedLocalTaskId ?? null,
        relatedExternalTaskId: opts.relatedExternalTaskId ?? null,
        message: opts.message ?? null,
        ...(opts.requestPayload != null && { requestPayload: opts.requestPayload as object }),
      },
    });
  };

  const normalized = normalizeInboundPayload(payload);
  if (!normalized) {
    await logInbound({
      status: 'ERROR',
      message: 'Invalid payload: missing taskId',
      requestPayload: payload as unknown as object,
    });
    await prisma.plannerInboundEvent.upsert({
      where: { eventHash },
      create: {
        integrationId,
        sourceMode,
        externalEventId: payload.eventId ?? null,
        eventHash,
        eventType,
        payload: payload as unknown as object,
        processed: true,
        processedAt: new Date(),
        processingError: 'Invalid payload: missing taskId',
      },
      update: {},
    });
    return { processed: true, created: 0, updated: 0, skipped: 0, errors: ['Invalid payload: missing taskId'] };
  }

  const errors: string[] = [];
  const created = 0;
  let updated = 0;
  let skipped = 0;

  try {
    const link = await prisma.plannerTaskLink.findUnique({
      where: { externalTaskId: normalized.externalTaskId },
      include: { localTask: true },
    });

    if (link) {
      if (link.localTask.boutiqueId !== boutiqueId && boutiqueId) {
        errors.push('Boutique scope mismatch');
        skipped++;
      } else if (normalized.isCompleted) {
        const assigneeEmpId = normalized.assignedEmails[0]
          ? await resolveEmployeeIdFromMicrosoft(
              boutiqueId,
              normalized.assignedEmails[0],
              normalized.assignedDisplayNames[0] ?? null,
              null
            )
          : null;
        if (assigneeEmpId) {
          const user = await prisma.user.findUnique({ where: { empId: assigneeEmpId }, select: { id: true } });
          if (user) {
            await prisma.taskCompletion.upsert({
              where: { taskId_userId: { taskId: link.localTaskId, userId: user.id } },
              create: { taskId: link.localTaskId, userId: user.id, completedAt: new Date() },
              update: { completedAt: new Date(), undoneAt: null },
            });
            await prisma.task.update({
              where: { id: link.localTaskId },
              data: { completionSource: 'PLANNER_IMPORT', importedCompletionAt: new Date() },
            });
            updated++;
          } else skipped++;
        } else skipped++;
      } else skipped++;
    } else {
      skipped++;
      errors.push('No linked task for externalTaskId');
    }

    await logInbound({
      relatedLocalTaskId: link?.localTaskId ?? null,
      relatedExternalTaskId: normalized.externalTaskId,
      status: errors.length ? 'ERROR' : updated > 0 ? 'SUCCESS' : 'SKIPPED',
      message: errors.length ? errors.join('; ') : updated > 0 ? `Updated task ${link?.localTaskId}` : 'Skipped',
      requestPayload: payload as unknown as object,
    });
    await prisma.plannerInboundEvent.upsert({
      where: { eventHash },
      create: {
        integrationId,
        sourceMode,
        externalEventId: payload.eventId ?? null,
        eventHash,
        eventType,
        payload: payload as unknown as object,
        processed: true,
        processedAt: new Date(),
        processingError: errors.length ? errors.join('; ') : null,
      },
      update: {},
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(msg);
    await logInbound({
      relatedExternalTaskId: normalized?.externalTaskId ?? null,
      status: 'ERROR',
      message: msg,
      requestPayload: payload as unknown as object,
    });
    await prisma.plannerInboundEvent.upsert({
      where: { eventHash },
      create: {
        integrationId,
        sourceMode,
        externalEventId: payload.eventId ?? null,
        eventHash,
        eventType,
        payload: payload as unknown as object,
        processed: true,
        processedAt: new Date(),
        processingError: msg,
      },
      update: {},
    });
  }

  return { processed: true, created, updated, skipped, errors };
}
