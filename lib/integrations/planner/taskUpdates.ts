import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { normalizePlannerEvent, type PlannerTaskUpdatePayload } from '@/lib/integrations/planner/normalizePlannerEvent';

export function completionIdentityKey(input: { email: string | null; name: string | null }): string {
  if (input.email) return `email:${input.email.toLowerCase()}`;
  if (input.name) return `name:${input.name.trim().toLowerCase().replace(/\s+/g, ' ')}`;
  return 'unknown:anonymous';
}

async function matchUserIdByEmail(email: string | null): Promise<string | null> {
  if (!email) return null;
  const emp = await prisma.employee.findFirst({
    where: { email: email.toLowerCase(), active: true, user: { isNot: null } },
    select: { user: { select: { id: true } } },
  });
  return emp?.user?.id ?? null;
}

function eventPayloadJson(input: PlannerTaskUpdatePayload): Prisma.InputJsonValue {
  return input as unknown as Prisma.InputJsonValue;
}

export async function ingestPlannerTaskUpdate(rawPayload: PlannerTaskUpdatePayload) {
  const normalized = normalizePlannerEvent(rawPayload);

  const mapped = normalized.internalTaskKey
    ? await prisma.plannerTaskMapping.findFirst({
        where: {
          isActive: true,
          OR: [
            ...(normalized.plannerTaskId ? [{ plannerTaskId: normalized.plannerTaskId }] : []),
            {
              internalTaskKey: normalized.internalTaskKey,
              ...(normalized.taskType ? { taskType: normalized.taskType } : {}),
              ...(normalized.branchCode ? { branchCode: normalized.branchCode } : {}),
            },
          ],
        },
        select: { boutiqueId: true, internalTaskKey: true, taskType: true, branchCode: true },
      })
    : null;

  const finalKey = mapped?.internalTaskKey ?? normalized.internalTaskKey;
  const finalType = mapped?.taskType ?? normalized.taskType;
  const finalBranch = mapped?.branchCode ?? normalized.branchCode;
  const boutiqueId = mapped?.boutiqueId ?? null;

  const event = await prisma.plannerTaskEvent.create({
    data: {
      plannerTaskId: normalized.plannerTaskId,
      plannerTaskTitle: normalized.plannerTaskTitle,
      internalTaskKey: finalKey,
      taskType: finalType ?? undefined,
      branchCode: finalBranch,
      bucketName: normalized.bucketName,
      assignedToName: normalized.assignedToName,
      assignedToEmail: normalized.assignedToEmail,
      completedByName: normalized.completedByName,
      completedByEmail: normalized.completedByEmail,
      status: normalized.status,
      eventAt: normalized.eventAt,
      payloadJson: eventPayloadJson(rawPayload),
      source: 'POWER_AUTOMATE',
      receivedAt: new Date(),
    },
    select: { id: true, status: true, eventAt: true },
  });

  let completionSaved = false;
  let completionId: string | null = null;

  if (normalized.status === 'COMPLETED' && finalKey && finalType) {
    const completedByUserId = await matchUserIdByEmail(normalized.completedByEmail);
    const identity = completionIdentityKey({
      email: normalized.completedByEmail,
      name: normalized.completedByName,
    });
    const completion = await prisma.plannerTaskCompletion.upsert({
      where: {
        internalTaskKey_completedByIdentityKey_completedOnDateKey: {
          internalTaskKey: finalKey,
          completedByIdentityKey: identity,
          completedOnDateKey: normalized.completedOnDateKey,
        },
      },
      create: {
        boutiqueId,
        internalTaskKey: finalKey,
        taskType: finalType,
        branchCode: finalBranch,
        plannerTaskId: normalized.plannerTaskId,
        plannerTaskTitle: normalized.plannerTaskTitle,
        completedByUserId,
        completedByName: normalized.completedByName,
        completedByEmail: normalized.completedByEmail,
        completedByIdentityKey: identity,
        completedOnDateKey: normalized.completedOnDateKey,
        completedAt: normalized.eventAt,
        source: 'PLANNER',
        rawEventId: event.id,
      },
      update: {
        boutiqueId,
        plannerTaskId: normalized.plannerTaskId,
        plannerTaskTitle: normalized.plannerTaskTitle,
        completedByUserId,
        completedByName: normalized.completedByName,
        completedByEmail: normalized.completedByEmail,
        completedAt: normalized.eventAt,
        rawEventId: event.id,
      },
      select: { id: true },
    });
    completionSaved = true;
    completionId = completion.id;
  }

  return {
    normalized,
    mapped,
    event,
    completionSaved,
    completionId,
    normalizationSkippedReason:
      normalized.status === 'COMPLETED' && (!finalKey || !finalType)
        ? 'Missing KEY or TYPE in notes metadata'
        : null,
  };
}

