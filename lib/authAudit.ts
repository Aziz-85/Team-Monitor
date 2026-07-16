import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';

export type AuthAuditEvent =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'LOGIN_RATE_LIMITED'
  | 'ACCOUNT_LOCKED'
  | 'SECURITY_ALERT'
  | 'LOGOUT'
  | '2FA_FAILED'
  | '2FA_SUCCESS'
  | 'PLATFORM_MODE_ENABLED'
  | 'PLATFORM_MODE_DISABLED'
  | 'TRUSTED_DEVICE_CREATED'
  | 'TRUSTED_DEVICE_USED'
  | 'TRUSTED_DEVICE_ROTATED'
  | 'TRUSTED_DEVICE_REVOKED'
  | 'TRUSTED_DEVICES_REVOKED_ALL'
  | 'TRUSTED_DEVICE_REJECTED';

export async function writeAuthAudit(data: {
  event: AuthAuditEvent;
  userId?: string | null;
  emailAttempted?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  deviceHint?: string | null;
  reason?: string | null;
  metadata?: Prisma.InputJsonValue | null;
}): Promise<void> {
  try {
    await prisma.authAuditLog.create({
      data: {
        event: data.event,
        userId: data.userId ?? null,
        emailAttempted: data.emailAttempted ?? null,
        ip: data.ip ?? null,
        userAgent: data.userAgent ?? null,
        deviceHint: data.deviceHint ?? null,
        reason: data.reason ?? null,
        metadata: data.metadata ?? undefined,
      },
    });
  } catch {
    // Do not fail auth flows if audit write fails
  }
}
