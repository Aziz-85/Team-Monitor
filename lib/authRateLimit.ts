import { prisma } from '@/lib/db';
import {
  LOGIN_RATE_LIMIT_PER_IP,
  LOGIN_RATE_LIMIT_PER_EMAIL,
  LOGIN_RATE_LIMIT_WINDOW_MINUTES,
  LOGIN_LOCKOUT_AFTER_ATTEMPTS,
  LOGIN_LOCKOUT_MINUTES,
} from '@/lib/sessionConfig';

const WINDOW_MS = LOGIN_RATE_LIMIT_WINDOW_MINUTES * 60 * 1000;

/**
 * Check and consume rate limit for a key (e.g. "ip:1.2.3.4" or "email:user@x.com").
 * Returns true if rate limited (caller should return 429).
 */
export async function checkLoginRateLimit(
  key: string,
  limit: number
): Promise<{ limited: boolean; blockedUntil?: Date }> {
  const now = new Date();
  const existing = await prisma.authRateLimit.findUnique({ where: { key } });

  if (existing && existing.blockedUntil && existing.blockedUntil > now) {
    return { limited: true, blockedUntil: existing.blockedUntil };
  }

  const windowStart = new Date(now.getTime() - WINDOW_MS);
  const isNewWindow = !existing || existing.windowStart < windowStart;

  const newCount = isNewWindow ? 1 : existing!.count + 1;
  const newWindowStart = isNewWindow ? now : existing!.windowStart;
  const blockedUntil =
    newCount >= limit ? new Date(now.getTime() + LOGIN_RATE_LIMIT_WINDOW_MINUTES * 60 * 1000) : null;

  await prisma.authRateLimit.upsert({
    where: { key },
    create: {
      key,
      windowStart: newWindowStart,
      count: newCount,
      blockedUntil,
      updatedAt: now,
    },
    update: {
      windowStart: newWindowStart,
      count: newCount,
      blockedUntil,
      updatedAt: now,
    },
  });

  if (newCount >= limit) return { limited: true, blockedUntil: blockedUntil ?? undefined };
  return { limited: false };
}

/** Check both IP and email rate limits. Returns which limit hit or null. */
export async function checkLoginRateLimits(
  ip: string | null,
  emailAttempted: string
): Promise<{ limited: boolean; reason?: string; blockedUntil?: Date }> {
  const ipKey = ip ? `ip:${ip}` : null;
  const emailKey = `email:${emailAttempted.toLowerCase()}`;

  if (ipKey) {
    const r = await checkLoginRateLimit(ipKey, LOGIN_RATE_LIMIT_PER_IP);
    if (r.limited) return { limited: true, reason: 'IP', blockedUntil: r.blockedUntil };
  }
  const r = await checkLoginRateLimit(emailKey, LOGIN_RATE_LIMIT_PER_EMAIL);
  if (r.limited) return { limited: true, reason: 'EMAIL', blockedUntil: r.blockedUntil };
  return { limited: false };
}

export async function isUserLocked(user: { lockedUntil?: Date | null }): Promise<boolean> {
  if (!user.lockedUntil) return false;
  return user.lockedUntil > new Date();
}

export function getLockoutRemainingMinutes(user: { lockedUntil: Date | null }): number {
  if (!user.lockedUntil) return 0;
  const remaining = user.lockedUntil.getTime() - Date.now();
  return Math.max(0, Math.ceil(remaining / 60000));
}

/** Record failed login: increment attempts, lock if >= threshold. */
export async function recordFailedLogin(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;
  const attempts = (user.failedLoginAttempts ?? 0) + 1;
  const lockedUntil =
    attempts >= LOGIN_LOCKOUT_AFTER_ATTEMPTS
      ? new Date(Date.now() + LOGIN_LOCKOUT_MINUTES * 60 * 1000)
      : null;
  await prisma.user.update({
    where: { id: userId },
    data: {
      failedLoginAttempts: attempts,
      lockedUntil,
    },
  });
}

/** Clear lock and failed count on successful login. */
export async function clearFailedLogin(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { failedLoginAttempts: 0, lockedUntil: null },
  });
}

/** Count failed attempts from same IP in last window (for SECURITY_ALERT). */
export async function countRecentFailedAttemptsByIp(ip: string | null): Promise<number> {
  if (!ip) return 0;
  const windowStart = new Date(Date.now() - WINDOW_MS);
  return prisma.authAuditLog.count({
    where: {
      event: 'LOGIN_FAILED',
      ip,
      createdAt: { gte: windowStart },
    },
  });
}
