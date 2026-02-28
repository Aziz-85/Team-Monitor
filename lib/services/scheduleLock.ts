/**
 * Schedule locking (Sprint 1: DAY / WEEK + RBAC).
 * All reads/writes are per boutiqueId. Locking a week in S05 does not affect S02.
 */

import { prisma } from '@/lib/db';
import type { Role } from '@prisma/client';
import { getWeekStartSaturday } from '@/lib/utils/week';

export type ScheduleWeekStatusEnum = 'DRAFT' | 'APPROVED';

export function getWeekStart(date: Date): string {
  const start = getWeekStartSaturday(date);
  const y = start.getFullYear();
  const m = String(start.getMonth() + 1).padStart(2, '0');
  const day = String(start.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Get week status for a boutique. */
export async function getWeekStatus(
  weekStart: string,
  boutiqueId: string
): Promise<{
  status: ScheduleWeekStatusEnum;
  approvedByUserId: string | null;
  approvedAt: Date | null;
} | null> {
  const row = await prisma.scheduleWeekStatus.findUnique({
    where: { weekStart_boutiqueId: { weekStart, boutiqueId } },
  });
  if (!row) return { status: 'DRAFT', approvedByUserId: null, approvedAt: null };
  return {
    status: row.status as ScheduleWeekStatusEnum,
    approvedByUserId: row.approvedByUserId,
    approvedAt: row.approvedAt,
  };
}

export type LockInfo = {
  id: string;
  scopeType: 'DAY' | 'WEEK';
  scopeValue: string;
  lockedByUserId: string;
  lockedAt: Date;
  reason: string | null;
  isActive: boolean;
};

const lockWhereWeek = (weekStart: string, boutiqueId: string) => ({
  scopeType: 'WEEK' as const,
  scopeValue: weekStart,
  boutiqueId,
  isActive: true,
});

const lockWhereDay = (dateStr: string, boutiqueId: string) => ({
  scopeType: 'DAY' as const,
  scopeValue: dateStr,
  boutiqueId,
  isActive: true,
});

export async function isWeekLocked(weekStart: string, boutiqueId: string): Promise<boolean> {
  const lock = await prisma.scheduleLock.findFirst({
    where: lockWhereWeek(weekStart, boutiqueId),
  });
  return !!lock;
}

export async function isDayLocked(date: Date, boutiqueId: string): Promise<boolean> {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  const dateStr = d.toISOString().slice(0, 10);
  const lock = await prisma.scheduleLock.findFirst({
    where: lockWhereDay(dateStr, boutiqueId),
  });
  return !!lock;
}

export async function getWeekLockInfo(
  weekStart: string,
  boutiqueId: string
): Promise<LockInfo | null> {
  const lock = await prisma.scheduleLock.findFirst({
    where: lockWhereWeek(weekStart, boutiqueId),
  });
  return lock
    ? {
        id: lock.id,
        scopeType: lock.scopeType as 'WEEK',
        scopeValue: lock.scopeValue,
        lockedByUserId: lock.lockedByUserId,
        lockedAt: lock.lockedAt,
        reason: lock.reason,
        isActive: lock.isActive,
      }
    : null;
}

export async function getDayLockInfo(
  date: Date,
  boutiqueId: string
): Promise<LockInfo | null> {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  const dateStr = d.toISOString().slice(0, 10);
  const lock = await prisma.scheduleLock.findFirst({
    where: lockWhereDay(dateStr, boutiqueId),
  });
  return lock
    ? {
        id: lock.id,
        scopeType: lock.scopeType as 'DAY',
        scopeValue: lock.scopeValue,
        lockedByUserId: lock.lockedByUserId,
        lockedAt: lock.lockedAt,
        reason: lock.reason,
        isActive: lock.isActive,
      }
    : null;
}

/** Returns lock info for week (if week locked) and which days in the week are day-locked, for this boutique. */
export async function getWeekLockInfoDetailed(
  weekStart: string,
  boutiqueId: string
): Promise<{
  weekLock: LockInfo | null;
  lockedDays: string[];
}> {
  const weekLock = await prisma.scheduleLock.findFirst({
    where: lockWhereWeek(weekStart, boutiqueId),
  });
  const start = new Date(weekStart + 'T00:00:00Z');
  const lockedDays: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    const dayLock = await prisma.scheduleLock.findFirst({
      where: lockWhereDay(dateStr, boutiqueId),
    });
    if (dayLock) lockedDays.push(dateStr);
  }
  return {
    weekLock: weekLock
      ? {
          id: weekLock.id,
          scopeType: weekLock.scopeType as 'WEEK',
          scopeValue: weekLock.scopeValue,
          lockedByUserId: weekLock.lockedByUserId,
          lockedAt: weekLock.lockedAt,
          reason: weekLock.reason,
          isActive: weekLock.isActive,
        }
      : null,
    lockedDays,
  };
}

/** ASSISTANT_MANAGER + MANAGER: day only. ADMIN/SUPER_ADMIN: day + week. */
export function canLockDay(role: Role): boolean {
  return role === 'ASSISTANT_MANAGER' || role === 'MANAGER' || role === 'ADMIN' || role === 'SUPER_ADMIN';
}

export function canLockWeek(role: Role): boolean {
  return role === 'ADMIN' || role === 'SUPER_ADMIN';
}

export function canUnlockWeek(role: Role): boolean {
  return role === 'ADMIN' || role === 'SUPER_ADMIN';
}

export function canApproveWeek(role: Role): boolean {
  return role === 'MANAGER' || role === 'ADMIN' || role === 'SUPER_ADMIN';
}

export function canUnlockDay(role: Role): boolean {
  return role === 'ASSISTANT_MANAGER' || role === 'MANAGER' || role === 'ADMIN' || role === 'SUPER_ADMIN';
}

/** Ensure week status exists for this boutique; set to APPROVED. */
export async function approveWeek(
  weekStart: string,
  boutiqueId: string,
  userId: string
): Promise<void> {
  await prisma.scheduleWeekStatus.upsert({
    where: { weekStart_boutiqueId: { weekStart, boutiqueId } },
    create: {
      weekStart,
      boutiqueId,
      status: 'APPROVED',
      approvedByUserId: userId,
      approvedAt: new Date(),
    },
    update: { status: 'APPROVED', approvedByUserId: userId, approvedAt: new Date() },
  });
}

/** Revert week to DRAFT for this boutique. ADMIN only. Allowed when week is not locked. */
export async function unapproveWeek(weekStart: string, boutiqueId: string): Promise<void> {
  const locked = await isWeekLocked(weekStart, boutiqueId);
  if (locked) {
    throw new Error('WEEK_LOCKED');
  }
  await prisma.scheduleWeekStatus.upsert({
    where: { weekStart_boutiqueId: { weekStart, boutiqueId } },
    create: { weekStart, boutiqueId, status: 'DRAFT' },
    update: { status: 'DRAFT', approvedByUserId: null, approvedAt: null },
  });
}

/** Lock day for this boutique. */
export async function lockDay(
  date: Date,
  boutiqueId: string,
  userId: string,
  reason?: string | null
): Promise<void> {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  const dateStr = d.toISOString().slice(0, 10);
  await prisma.scheduleLock.updateMany({
    where: lockWhereDay(dateStr, boutiqueId),
    data: { isActive: false },
  });
  await prisma.scheduleLock.create({
    data: {
      boutiqueId,
      scopeType: 'DAY',
      scopeValue: dateStr,
      lockedByUserId: userId,
      reason: reason ?? null,
      isActive: true,
    },
  });
}

/** Unlock day (revoke active lock) for this boutique. */
export async function unlockDay(
  date: Date,
  boutiqueId: string,
  revokedByUserId: string
): Promise<void> {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  const dateStr = d.toISOString().slice(0, 10);
  await prisma.scheduleLock.updateMany({
    where: lockWhereDay(dateStr, boutiqueId),
    data: { isActive: false, revokedByUserId, revokedAt: new Date() },
  });
}

/** Lock week for this boutique. ADMIN only. Week must be APPROVED. */
export async function lockWeek(
  weekStart: string,
  boutiqueId: string,
  userId: string,
  reason?: string | null
): Promise<void> {
  const status = await getWeekStatus(weekStart, boutiqueId);
  if (status?.status !== 'APPROVED') {
    throw new Error('WEEK_NOT_APPROVED');
  }
  await prisma.scheduleLock.updateMany({
    where: lockWhereWeek(weekStart, boutiqueId),
    data: { isActive: false },
  });
  await prisma.scheduleLock.create({
    data: {
      boutiqueId,
      scopeType: 'WEEK',
      scopeValue: weekStart,
      lockedByUserId: userId,
      reason: reason ?? null,
      isActive: true,
    },
  });
}

/** Lock week without requiring APPROVED. ADMIN only. */
export async function lockWeekAllowDraft(
  weekStart: string,
  boutiqueId: string,
  userId: string,
  reason?: string | null
): Promise<void> {
  await prisma.scheduleLock.updateMany({
    where: lockWhereWeek(weekStart, boutiqueId),
    data: { isActive: false },
  });
  await prisma.scheduleLock.create({
    data: {
      boutiqueId,
      scopeType: 'WEEK',
      scopeValue: weekStart,
      lockedByUserId: userId,
      reason: reason ?? null,
      isActive: true,
    },
  });
}

/** Unlock week (revoke active lock) for this boutique. ADMIN only. */
export async function unlockWeek(
  weekStart: string,
  boutiqueId: string,
  revokedByUserId: string
): Promise<void> {
  await prisma.scheduleLock.updateMany({
    where: lockWhereWeek(weekStart, boutiqueId),
    data: { isActive: false, revokedByUserId, revokedAt: new Date() },
  });
}

/** Check if any of the given dates are in a locked week or are locked days for this boutique. */
export async function checkLockForChanges(
  dates: string[],
  boutiqueId: string
): Promise<{ forbidden: true; message: string } | null> {
  const weekStarts = new Set<string>();
  for (const dateStr of dates) {
    weekStarts.add(getWeekStart(new Date(dateStr + 'T00:00:00Z')));
  }
  for (const ws of Array.from(weekStarts)) {
    if (await isWeekLocked(ws, boutiqueId)) {
      return { forbidden: true, message: 'Schedule week is locked' };
    }
  }
  for (const dateStr of dates) {
    if (await isDayLocked(new Date(dateStr + 'T00:00:00Z'), boutiqueId)) {
      return { forbidden: true, message: 'Schedule day is locked' };
    }
  }
  return null;
}
