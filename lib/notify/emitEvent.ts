/**
 * Central push event emission with dedupe (NotificationEventLog) and quiet hours.
 * Only: SCHEDULE_PUBLISHED, SCHEDULE_CHANGED, TASK_ASSIGNED, TASK_DUE_SOON, TASK_OVERDUE.
 */

import { createHash } from 'crypto';
import { prisma } from '@/lib/db';
import { sendExpoPush, type ExpoPushMessage } from '@/lib/push/expoPush';

export type NotifyEventType =
  | 'SCHEDULE_PUBLISHED'
  | 'SCHEDULE_CHANGED'
  | 'TASK_ASSIGNED'
  | 'TASK_DUE_SOON'
  | 'TASK_OVERDUE';

export type EmitEventOptions = {
  boutiqueId?: string;
  affectedUserIds: string[];
  payload: Record<string, unknown>;
};

function buildEventKey(
  type: NotifyEventType,
  userId: string,
  payload: Record<string, unknown>
): string {
  const weekKey = (p: Record<string, unknown>) => (p.weekStart as string) ?? '';
  const dayKey = (p: Record<string, unknown>) => (p.date as string) ?? '';
  switch (type) {
    case 'SCHEDULE_PUBLISHED':
      return `SCHEDULE_PUBLISHED:${userId}:${weekKey(payload)}`;
    case 'SCHEDULE_CHANGED': {
      const summary = JSON.stringify({
        date: payload.date,
        weekStart: payload.weekStart,
        changedCount: payload.changedCount,
      });
      const h = createHash('sha256').update(summary).digest('hex').slice(0, 12);
      return `SCHEDULE_CHANGED:${userId}:${weekKey(payload)}:${dayKey(payload)}:${h}`;
    }
    case 'TASK_ASSIGNED':
      return `TASK_ASSIGNED:${userId}:${(payload.taskId as string) ?? ''}`;
    case 'TASK_DUE_SOON': {
      const bucket = (payload.bucket as string) ?? (payload.dueDate as string) ?? '';
      return `TASK_DUE_SOON:${userId}:${(payload.taskId as string) ?? ''}:${bucket}`;
    }
    case 'TASK_OVERDUE': {
      const bucket = (payload.bucket as string) ?? (payload.dueDate as string) ?? '';
      return `TASK_OVERDUE:${userId}:${(payload.taskId as string) ?? ''}:${bucket}`;
    }
    default:
      return `UNKNOWN:${userId}:${Date.now()}`;
  }
}

function isInQuietHours(start: string | null, end: string | null): boolean {
  if (!start || !end) return false;
  const now = new Date();
  const ksa = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Riyadh' }));
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const nowMins = ksa.getHours() * 60 + ksa.getMinutes();
  const startMins = sh * 60 + sm;
  const endMins = eh * 60 + em;
  if (startMins > endMins) {
    return nowMins >= startMins || nowMins < endMins;
  }
  return nowMins >= startMins && nowMins < endMins;
}

function getDeepLink(type: NotifyEventType): string {
  if (type === 'SCHEDULE_PUBLISHED' || type === 'SCHEDULE_CHANGED') return '/(tabs)/schedule';
  return '/(tabs)/tasks';
}

function buildTitleAndBody(
  type: NotifyEventType,
  payload: Record<string, unknown>
): { title: string; body: string } {
  switch (type) {
    case 'SCHEDULE_PUBLISHED': {
      const weekStart = payload.weekStart as string;
      return { title: 'Schedule published', body: `New schedule for week ${weekStart ?? ''} is available.` };
    }
    case 'SCHEDULE_CHANGED': {
      const weekStart = payload.weekStart as string;
      return { title: 'Schedule changed', body: `Your schedule for week ${weekStart ?? ''} has been updated.` };
    }
    case 'TASK_ASSIGNED': {
      const taskTitle = payload.taskTitle as string | undefined;
      const dueDate = payload.dueDate as string;
      return {
        title: 'Task assigned',
        body: taskTitle ? `"${taskTitle}" is due ${dueDate}.` : `A task is due ${dueDate}.`,
      };
    }
    case 'TASK_DUE_SOON': {
      const taskTitle = payload.taskTitle as string | undefined;
      const dueDate = payload.dueDate as string;
      return {
        title: 'Task due soon',
        body: taskTitle ? `"${taskTitle}" is due soon (${dueDate}).` : `A task is due soon (${dueDate}).`,
      };
    }
    case 'TASK_OVERDUE': {
      const taskTitle = payload.taskTitle as string | undefined;
      const dueDate = payload.dueDate as string;
      return {
        title: 'Task overdue',
        body: taskTitle ? `"${taskTitle}" was due ${dueDate}.` : `A task was due ${dueDate}.`,
      };
    }
    default:
      return { title: 'Notification', body: '' };
  }
}

export async function emitEvent(type: NotifyEventType, options: EmitEventOptions): Promise<void> {
  const { boutiqueId, affectedUserIds, payload } = options;
  if (affectedUserIds.length === 0) return;

  const isSchedule = type === 'SCHEDULE_PUBLISHED' || type === 'SCHEDULE_CHANGED';
  const isTask = type === 'TASK_ASSIGNED' || type === 'TASK_DUE_SOON' || type === 'TASK_OVERDUE';

  const users = await prisma.user.findMany({
    where: { id: { in: affectedUserIds } },
    select: {
      id: true,
      notificationPreference: true,
      mobileDevicePushTokens: {
        where: { revokedAt: null },
        select: { expoPushToken: true },
      },
    },
  });

  const messages: ExpoPushMessage[] = [];
  const deepLink = getDeepLink(type);
  const { title, body } = buildTitleAndBody(type, payload);

  for (const user of users) {
    const eventKey = buildEventKey(type, user.id, payload);
    try {
      await prisma.notificationEventLog.create({
        data: {
          eventKey,
          type,
          userId: user.id,
          boutiqueId: boutiqueId ?? null,
          payload: payload as object,
        },
      });
    } catch (e: unknown) {
      const prismaError = e as { code?: string };
      if (prismaError.code === 'P2002') continue;
      throw e;
    }

    const prefs = user.notificationPreference;
    if (isSchedule && !(prefs?.scheduleEnabled ?? true)) continue;
    if (isTask && !(prefs?.tasksEnabled ?? true)) continue;
    if (prefs && isInQuietHours(prefs.quietHoursStart, prefs.quietHoursEnd)) {
      console.log('[Push] Skipped (quiet hours)', type, user.id);
      continue;
    }
    if (user.mobileDevicePushTokens.length === 0) continue;

    for (const t of user.mobileDevicePushTokens) {
      messages.push({
        to: t.expoPushToken,
        title,
        body,
        data: { type, deepLink, ...payload },
      });
    }
  }

  await sendExpoPush(messages);
}

/** Fire-and-forget wrapper for call sites that don't await. */
export function emitEventAsync(type: NotifyEventType, options: EmitEventOptions): void {
  void emitEvent(type, options);
}
