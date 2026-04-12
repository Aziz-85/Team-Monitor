import type { Role } from '@prisma/client';
import { prisma } from '@/lib/db';
import {
  MAX_UNLOCK_FAILURES,
  UNLOCK_FAIL_WINDOW_MS,
  UNLOCK_TTL_MS,
  MATRIX_SECURE_EDIT_PAGE,
} from '@/lib/matrixSecureEdit/constants';

const ADMIN_MATRIX_ROLES: Role[] = ['ADMIN', 'SUPER_ADMIN'];

export function assertAdminMatrixSecureEditRole(role: string): role is 'ADMIN' | 'SUPER_ADMIN' {
  return ADMIN_MATRIX_ROLES.includes(role as Role);
}

export async function countUnlockFailuresSince(actorUserId: string): Promise<number> {
  const since = new Date(Date.now() - UNLOCK_FAIL_WINDOW_MS);
  return prisma.salesMatrixEditActivityLog.count({
    where: {
      actorUserId,
      eventType: 'UNLOCK_FAILURE',
      createdAt: { gte: since },
    },
  });
}

export async function logMatrixSecureActivity(input: {
  unlockSessionId?: string | null;
  actorUserId: string;
  boutiqueId: string;
  month?: string | null;
  eventType: string;
  detail?: string | null;
  meta?: Record<string, unknown>;
}): Promise<void> {
  await prisma.salesMatrixEditActivityLog.create({
    data: {
      unlockSessionId: input.unlockSessionId ?? undefined,
      actorUserId: input.actorUserId,
      boutiqueId: input.boutiqueId,
      month: input.month ?? undefined,
      eventType: input.eventType,
      detail: input.detail ?? undefined,
      meta: input.meta as object | undefined,
    },
  });
}

export async function revokeOpenSessionsForScope(
  userId: string,
  boutiqueId: string,
  month: string
): Promise<void> {
  const now = new Date();
  await prisma.salesMatrixEditUnlockSession.updateMany({
    where: {
      userId,
      boutiqueId,
      month,
      revokedAt: null,
      expiresAt: { gt: now },
    },
    data: { revokedAt: now },
  });
}

export async function createUnlockSession(input: {
  userId: string;
  boutiqueId: string;
  month: string;
  reason: string;
  unlockAuthMethod?: string;
}): Promise<{ id: string; expiresAt: Date }> {
  const expiresAt = new Date(Date.now() + UNLOCK_TTL_MS);
  await revokeOpenSessionsForScope(input.userId, input.boutiqueId, input.month);
  const row = await prisma.salesMatrixEditUnlockSession.create({
    data: {
      userId: input.userId,
      boutiqueId: input.boutiqueId,
      month: input.month,
      reason: input.reason,
      unlockAuthMethod: input.unlockAuthMethod ?? 'PASSWORD_REAUTH',
      expiresAt,
    },
  });
  return { id: row.id, expiresAt: row.expiresAt };
}

export type ValidUnlockSession = {
  id: string;
  expiresAt: Date;
  reason: string;
};

export async function getValidUnlockSession(
  sessionId: string,
  userId: string,
  boutiqueId: string,
  month: string
): Promise<ValidUnlockSession | null> {
  const now = new Date();
  const row = await prisma.salesMatrixEditUnlockSession.findFirst({
    where: {
      id: sessionId,
      userId,
      boutiqueId,
      month,
      revokedAt: null,
      expiresAt: { gt: now },
    },
  });
  if (!row) return null;
  return { id: row.id, expiresAt: row.expiresAt, reason: row.reason };
}

export async function revokeUnlockSession(sessionId: string, userId: string): Promise<boolean> {
  const now = new Date();
  const res = await prisma.salesMatrixEditUnlockSession.updateMany({
    where: { id: sessionId, userId, revokedAt: null },
    data: { revokedAt: now },
  });
  return res.count > 0;
}

export { MATRIX_SECURE_EDIT_PAGE };

export async function assertUnlockThrottleOk(actorUserId: string): Promise<boolean> {
  const n = await countUnlockFailuresSince(actorUserId);
  return n < MAX_UNLOCK_FAILURES;
}
