/**
 * Trusted auth devices — hashed tokens in DB, raw token only in HttpOnly cookie.
 * Skip TOTP while trust is valid; password + normal session still required.
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import type { TrustedAuthDevice } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getCookiePrefix, shouldUseSecureCookies } from '@/lib/env';
import {
  isTrustedDevicesEnabled,
  TRUSTED_DEVICE_DEFAULT_DAYS,
  TRUSTED_DEVICE_MAX_DAYS,
} from '@/lib/auth/authFeatureFlags';
import { writeAuthAudit } from '@/lib/authAudit';
import type { RequestClientInfo } from '@/lib/requestClientInfo';

export type TrustedDevicePublic = {
  id: string;
  deviceName: string | null;
  browser: string | null;
  operatingSystem: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  lastIp: string | null;
  firstIp: string | null;
  isCurrent: boolean;
};

function trustSecret(): string {
  const s =
    process.env.AUTH_TRUSTED_DEVICE_SECRET?.trim() ||
    process.env.AUTH_TOTP_ENCRYPTION_KEY?.trim() ||
    process.env.MOBILE_JWT_ACCESS_SECRET?.trim();
  if (!s || s.length < 16) {
    throw new Error('AUTH_TRUSTED_DEVICE_SECRET (or AUTH_TOTP_ENCRYPTION_KEY) required for trusted devices');
  }
  return s;
}

export function getTrustedDeviceCookieName(): string {
  return `${getCookiePrefix()}trusted_device`;
}

export function hashTrustedDeviceToken(rawToken: string): string {
  return createHmac('sha256', trustSecret()).update(rawToken, 'utf8').digest('hex');
}

export function hashUserAgent(userAgent: string | null | undefined): string | null {
  if (!userAgent?.trim()) return null;
  return createHash('sha256').update(userAgent.trim(), 'utf8').digest('hex');
}

export function generateTrustedDeviceRawToken(): string {
  return randomBytes(32).toString('base64url');
}

export function clampTrustDays(days?: number | null): number {
  const n = typeof days === 'number' && Number.isFinite(days) ? Math.floor(days) : TRUSTED_DEVICE_DEFAULT_DAYS;
  return Math.max(1, Math.min(TRUSTED_DEVICE_MAX_DAYS, n));
}

export function parseUaBrowserOs(userAgent: string | null | undefined): {
  browser: string | null;
  operatingSystem: string | null;
  deviceName: string;
} {
  const ua = userAgent?.trim() ?? '';
  let browser: string | null = null;
  let operatingSystem: string | null = null;

  if (/edg\//i.test(ua)) browser = 'Edge';
  else if (/chrome\//i.test(ua) && !/edg\//i.test(ua)) browser = 'Chrome';
  else if (/firefox\//i.test(ua)) browser = 'Firefox';
  else if (/safari\//i.test(ua) && !/chrome\//i.test(ua)) browser = 'Safari';
  else if (ua) browser = 'Browser';

  if (/windows nt/i.test(ua)) operatingSystem = 'Windows';
  else if (/android/i.test(ua)) operatingSystem = 'Android';
  else if (/iphone|ipad|ipod/i.test(ua)) operatingSystem = 'iOS';
  else if (/mac os x|macintosh/i.test(ua)) operatingSystem = 'macOS';
  else if (/linux/i.test(ua)) operatingSystem = 'Linux';
  else if (ua) operatingSystem = 'Unknown OS';

  const deviceName = [browser, operatingSystem].filter(Boolean).join(' on ') || 'Trusted device';
  return { browser, operatingSystem, deviceName };
}

export function setTrustedDeviceCookie(
  rawToken: string,
  expiresAt: Date,
  options?: { secure?: boolean }
): {
  name: string;
  value: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'lax';
  path: string;
  expires: Date;
} {
  const secure = options?.secure ?? shouldUseSecureCookies();
  return {
    name: getTrustedDeviceCookieName(),
    value: rawToken,
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  };
}

export function clearTrustedDeviceCookie(options?: { secure?: boolean }): {
  name: string;
  value: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'lax';
  path: string;
  maxAge: number;
} {
  const secure = options?.secure ?? shouldUseSecureCookies();
  return {
    name: getTrustedDeviceCookieName(),
    value: '',
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  };
}

function safeEqualHex(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, 'hex');
    const bb = Buffer.from(b, 'hex');
    if (ba.length !== bb.length || ba.length === 0) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

export type TrustedDeviceAcceptResult =
  | { ok: true; device: TrustedAuthDevice; rotatedRawToken: string }
  | { ok: false; reason: string };

/**
 * Validate cookie token for user; on success rotate token and update lastUsed.
 */
export async function acceptTrustedDeviceToken(input: {
  userId: string;
  rawToken: string | null | undefined;
  client: RequestClientInfo;
}): Promise<TrustedDeviceAcceptResult> {
  if (!isTrustedDevicesEnabled()) {
    return { ok: false, reason: 'feature_disabled' };
  }
  const raw = input.rawToken?.trim();
  if (!raw) return { ok: false, reason: 'missing_token' };

  let tokenHash: string;
  try {
    tokenHash = hashTrustedDeviceToken(raw);
  } catch {
    return { ok: false, reason: 'misconfigured' };
  }

  const device = await prisma.trustedAuthDevice.findUnique({ where: { tokenHash } });
  if (!device) {
    await writeAuthAudit({
      event: 'TRUSTED_DEVICE_REJECTED',
      userId: input.userId,
      reason: 'UNKNOWN_TOKEN',
      ...input.client,
    });
    return { ok: false, reason: 'unknown_token' };
  }

  if (device.userId !== input.userId) {
    await writeAuthAudit({
      event: 'TRUSTED_DEVICE_REJECTED',
      userId: input.userId,
      reason: 'USER_MISMATCH',
      metadata: { deviceId: device.id },
      ...input.client,
    });
    return { ok: false, reason: 'user_mismatch' };
  }

  if (device.revokedAt) {
    await writeAuthAudit({
      event: 'TRUSTED_DEVICE_REJECTED',
      userId: input.userId,
      reason: 'REVOKED',
      metadata: { deviceId: device.id },
      ...input.client,
    });
    return { ok: false, reason: 'revoked' };
  }

  if (device.expiresAt.getTime() <= Date.now()) {
    await writeAuthAudit({
      event: 'TRUSTED_DEVICE_REJECTED',
      userId: input.userId,
      reason: 'EXPIRED',
      metadata: { deviceId: device.id },
      ...input.client,
    });
    return { ok: false, reason: 'expired' };
  }

  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { disabled: true },
  });
  if (!user || user.disabled) {
    await writeAuthAudit({
      event: 'TRUSTED_DEVICE_REJECTED',
      userId: input.userId,
      reason: 'USER_DISABLED',
      metadata: { deviceId: device.id },
      ...input.client,
    });
    return { ok: false, reason: 'user_disabled' };
  }

  const rotatedRaw = generateTrustedDeviceRawToken();
  const rotatedHash = hashTrustedDeviceToken(rotatedRaw);
  const now = new Date();

  const updated = await prisma.trustedAuthDevice.update({
    where: { id: device.id },
    data: {
      tokenHash: rotatedHash,
      lastUsedAt: now,
      lastIp: input.client.ip ?? device.lastIp,
    },
  });

  await writeAuthAudit({
    event: 'TRUSTED_DEVICE_USED',
    userId: input.userId,
    metadata: { deviceId: device.id },
    ...input.client,
  });
  await writeAuthAudit({
    event: 'TRUSTED_DEVICE_ROTATED',
    userId: input.userId,
    metadata: { deviceId: device.id },
    ...input.client,
  });

  // Ensure hash compare path is exercised for constant-time habits in tests
  void safeEqualHex(tokenHash, device.tokenHash);

  return { ok: true, device: updated, rotatedRawToken: rotatedRaw };
}

export async function createTrustedDevice(input: {
  userId: string;
  client: RequestClientInfo;
  days?: number | null;
  deviceName?: string | null;
}): Promise<{ device: TrustedAuthDevice; rawToken: string }> {
  const days = clampTrustDays(input.days);
  const rawToken = generateTrustedDeviceRawToken();
  const tokenHash = hashTrustedDeviceToken(rawToken);
  const parsed = parseUaBrowserOs(input.client.userAgent);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  const device = await prisma.trustedAuthDevice.create({
    data: {
      userId: input.userId,
      tokenHash,
      deviceName: input.deviceName?.trim() || parsed.deviceName,
      browser: parsed.browser,
      operatingSystem: parsed.operatingSystem,
      userAgentHash: hashUserAgent(input.client.userAgent),
      firstIp: input.client.ip,
      lastIp: input.client.ip,
      createdAt: now,
      lastUsedAt: now,
      expiresAt,
    },
  });

  await writeAuthAudit({
    event: 'TRUSTED_DEVICE_CREATED',
    userId: input.userId,
    metadata: { deviceId: device.id, days },
    ...input.client,
  });

  return { device, rawToken };
}

export async function listTrustedDevicesForUser(
  userId: string,
  currentTokenHash: string | null
): Promise<TrustedDevicePublic[]> {
  const rows = await prisma.trustedAuthDevice.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastUsedAt: 'desc' },
  });
  return rows.map((r) => ({
    id: r.id,
    deviceName: r.deviceName,
    browser: r.browser,
    operatingSystem: r.operatingSystem,
    createdAt: r.createdAt.toISOString(),
    lastUsedAt: r.lastUsedAt.toISOString(),
    expiresAt: r.expiresAt.toISOString(),
    lastIp: r.lastIp,
    firstIp: r.firstIp,
    isCurrent: Boolean(currentTokenHash && r.tokenHash === currentTokenHash),
  }));
}

export async function revokeTrustedDevice(input: {
  userId: string;
  deviceId: string;
  reason: string;
  client?: RequestClientInfo;
}): Promise<boolean> {
  const existing = await prisma.trustedAuthDevice.findFirst({
    where: { id: input.deviceId, userId: input.userId, revokedAt: null },
  });
  if (!existing) return false;
  await prisma.trustedAuthDevice.update({
    where: { id: existing.id },
    data: { revokedAt: new Date(), revokedReason: input.reason },
  });
  await writeAuthAudit({
    event: 'TRUSTED_DEVICE_REVOKED',
    userId: input.userId,
    reason: input.reason,
    metadata: { deviceId: existing.id },
    ...(input.client ?? {}),
  });
  return true;
}

export async function revokeAllTrustedDevicesForUser(
  userId: string,
  reason: string,
  client?: RequestClientInfo
): Promise<number> {
  const result = await prisma.trustedAuthDevice.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
  if (result.count > 0) {
    await writeAuthAudit({
      event: 'TRUSTED_DEVICES_REVOKED_ALL',
      userId,
      reason,
      metadata: { count: result.count },
      ...(client ?? {}),
    });
  }
  return result.count;
}

export async function renameTrustedDevice(input: {
  userId: string;
  deviceId: string;
  deviceName: string;
}): Promise<TrustedAuthDevice | null> {
  const name = input.deviceName.trim().slice(0, 80);
  if (!name) return null;
  const existing = await prisma.trustedAuthDevice.findFirst({
    where: { id: input.deviceId, userId: input.userId, revokedAt: null },
  });
  if (!existing) return null;
  return prisma.trustedAuthDevice.update({
    where: { id: existing.id },
    data: { deviceName: name },
  });
}

/** Call on password change, TOTP reset, account disable, sign-out-all. */
export async function revokeTrustedDevicesForSecurityEvent(
  userId: string,
  reason: string
): Promise<number> {
  return revokeAllTrustedDevicesForUser(userId, reason);
}
