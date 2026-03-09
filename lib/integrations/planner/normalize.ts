/**
 * Normalize inbound Planner payloads into local-safe structure.
 */

import type { InboundPlannerPayload, NormalizedInboundTask } from './types';

export function normalizeInboundPayload(payload: InboundPlannerPayload): NormalizedInboundTask | null {
  const taskId = payload.taskId ?? payload.raw?.taskId;
  if (!taskId || typeof taskId !== 'string') return null;

  const title = typeof payload.title === 'string' ? payload.title : String(payload.raw?.title ?? '');
  const description =
    typeof payload.description === 'string' ? payload.description : (payload.raw?.description as string) ?? null;
  const isCompleted = payload.isCompleted === true || payload.percentComplete === 100;
  const dueDateTime = payload.dueDateTime ?? (payload.raw?.dueDateTime as string);
  let dueDate: string | null = null;
  if (typeof dueDateTime === 'string') {
    try {
      const d = new Date(dueDateTime);
      if (!isNaN(d.getTime())) dueDate = d.toISOString().slice(0, 10);
    } catch {
      // ignore
    }
  }

  const assignedUsers = Array.isArray(payload.assignedUsers) ? payload.assignedUsers : [];
  const assignedEmails = assignedUsers
    .map((u) => (typeof u?.email === 'string' ? u.email : null))
    .filter((e): e is string => !!e);
  const assignedDisplayNames = assignedUsers
    .map((u) => (typeof u?.displayName === 'string' ? u.displayName : null))
    .filter((e): e is string => !!e);

  return {
    externalTaskId: String(taskId),
    externalPlanId: typeof payload.planId === 'string' ? payload.planId : null,
    externalBucketId: typeof payload.bucketId === 'string' ? payload.bucketId : null,
    title: title || 'Untitled',
    description,
    isCompleted,
    dueDate,
    assignedEmails,
    assignedDisplayNames,
    sourceUpdatedAt: typeof payload.sourceUpdatedAt === 'string' ? payload.sourceUpdatedAt : null,
  };
}
