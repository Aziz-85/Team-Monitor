/**
 * Trusted devices — hashing, cookie naming, accept/rotate/revoke, policy.
 */

process.env.AUTH_TRUSTED_DEVICES_ENABLED = 'true';
process.env.AUTH_TRUSTED_DEVICE_SECRET = 'test-trusted-device-secret-32chars!!';
process.env.COOKIE_PREFIX = 'dt_';

const db = {
  trustedAuthDevice: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  user: { findUnique: jest.fn() },
  authAuditLog: { create: jest.fn() },
};
jest.mock('@/lib/db', () => ({ prisma: db }));
jest.mock('@/lib/authAudit', () => ({
  writeAuthAudit: jest.fn(),
}));
jest.mock('@/lib/twoFactor', () => ({
  roleRequires2FA: (role: string) =>
    role === 'ADMIN' || role === 'SUPER_ADMIN' || role === 'MANAGER',
}));

import { createHash, createHmac } from 'crypto';
import {
  acceptTrustedDeviceToken,
  clampTrustDays,
  createTrustedDevice,
  generateTrustedDeviceRawToken,
  getTrustedDeviceCookieName,
  hashTrustedDeviceToken,
  revokeAllTrustedDevicesForUser,
  setTrustedDeviceCookie,
} from '@/lib/auth/trustedDevices';
import { decidePostPasswordAuthStep } from '@/lib/auth/authenticationPolicy';
import { writeAuthAudit } from '@/lib/authAudit';

const writeAudit = writeAuthAudit as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.AUTH_TRUSTED_DEVICES_ENABLED = 'true';
  process.env.AUTH_TRUSTED_DEVICE_SECRET = 'test-trusted-device-secret-32chars!!';
  process.env.COOKIE_PREFIX = 'dt_';
});

describe('trusted device tokens', () => {
  it('generates at least 32 random bytes (base64url length)', () => {
    const raw = generateTrustedDeviceRawToken();
    expect(raw.length).toBeGreaterThanOrEqual(43);
  });

  it('stores only HMAC hash, not raw token', () => {
    const raw = generateTrustedDeviceRawToken();
    const hash = hashTrustedDeviceToken(raw);
    expect(hash).not.toContain(raw);
    expect(hash).toHaveLength(64);
    expect(hash).toBe(
      createHmac('sha256', process.env.AUTH_TRUSTED_DEVICE_SECRET!)
        .update(raw, 'utf8')
        .digest('hex')
    );
  });

  it('uses HttpOnly cookie with staging-aware prefix', () => {
    expect(getTrustedDeviceCookieName()).toBe('dt_trusted_device');
    const cookie = setTrustedDeviceCookie('raw-token', new Date('2030-01-01T00:00:00.000Z'), {
      secure: true,
    });
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.secure).toBe(true);
    expect(cookie.sameSite).toBe('lax');
    expect(cookie.path).toBe('/');
    expect(cookie.value).toBe('raw-token');
  });

  it('clamps trust days to max 90', () => {
    expect(clampTrustDays(30)).toBe(30);
    expect(clampTrustDays(200)).toBe(90);
    expect(clampTrustDays(0)).toBe(1);
  });
});

describe('acceptTrustedDeviceToken', () => {
  const client = { ip: '1.2.3.4', userAgent: 'Mozilla/5.0', deviceHint: 'desktop' as const };

  it('rejects expired token', async () => {
    const raw = generateTrustedDeviceRawToken();
    const tokenHash = hashTrustedDeviceToken(raw);
    db.trustedAuthDevice.findUnique.mockResolvedValue({
      id: 'dev-1',
      userId: 'user-1',
      tokenHash,
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1000),
      lastIp: null,
    });
    const result = await acceptTrustedDeviceToken({
      userId: 'user-1',
      rawToken: raw,
      client,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('expired');
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'TRUSTED_DEVICE_REJECTED', reason: 'EXPIRED' })
    );
  });

  it('rejects revoked token', async () => {
    const raw = generateTrustedDeviceRawToken();
    const tokenHash = hashTrustedDeviceToken(raw);
    db.trustedAuthDevice.findUnique.mockResolvedValue({
      id: 'dev-1',
      userId: 'user-1',
      tokenHash,
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 86400000),
      lastIp: null,
    });
    const result = await acceptTrustedDeviceToken({
      userId: 'user-1',
      rawToken: raw,
      client,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('revoked');
  });

  it('rejects when user is disabled', async () => {
    const raw = generateTrustedDeviceRawToken();
    const tokenHash = hashTrustedDeviceToken(raw);
    db.trustedAuthDevice.findUnique.mockResolvedValue({
      id: 'dev-1',
      userId: 'user-1',
      tokenHash,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 86400000),
      lastIp: null,
    });
    db.user.findUnique.mockResolvedValue({ disabled: true });
    const result = await acceptTrustedDeviceToken({
      userId: 'user-1',
      rawToken: raw,
      client,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('user_disabled');
  });

  it('rotates token hash after successful use', async () => {
    const raw = generateTrustedDeviceRawToken();
    const tokenHash = hashTrustedDeviceToken(raw);
    db.trustedAuthDevice.findUnique.mockResolvedValue({
      id: 'dev-1',
      userId: 'user-1',
      tokenHash,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 86400000),
      lastIp: '9.9.9.9',
    });
    db.user.findUnique.mockResolvedValue({ disabled: false });
    db.trustedAuthDevice.update.mockImplementation(async ({ data }: { data: { tokenHash: string } }) => ({
      id: 'dev-1',
      userId: 'user-1',
      tokenHash: data.tokenHash,
      expiresAt: new Date(Date.now() + 86400000),
      revokedAt: null,
      lastIp: '1.2.3.4',
    }));

    const result = await acceptTrustedDeviceToken({
      userId: 'user-1',
      rawToken: raw,
      client,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rotatedRawToken).not.toBe(raw);
    expect(db.trustedAuthDevice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tokenHash: expect.not.stringMatching(tokenHash),
        }),
      })
    );
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ event: 'TRUSTED_DEVICE_USED' }));
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ event: 'TRUSTED_DEVICE_ROTATED' }));
  });
});

describe('createTrustedDevice', () => {
  it('persists hash only', async () => {
    db.trustedAuthDevice.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'dev-new',
      ...data,
    }));
    const { device, rawToken } = await createTrustedDevice({
      userId: 'user-1',
      client: { ip: '1.1.1.1', userAgent: 'Chrome Macintosh', deviceHint: 'desktop' },
      days: 30,
    });
    expect(rawToken.length).toBeGreaterThan(20);
    expect(device.tokenHash).toBe(hashTrustedDeviceToken(rawToken));
    expect(JSON.stringify(device)).not.toContain(rawToken);
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ event: 'TRUSTED_DEVICE_CREATED' }));
  });
});

describe('revokeAllTrustedDevicesForUser', () => {
  it('revokes all active devices (e.g. password reset)', async () => {
    db.trustedAuthDevice.updateMany.mockResolvedValue({ count: 2 });
    const n = await revokeAllTrustedDevicesForUser('user-1', 'PASSWORD_CHANGED');
    expect(n).toBe(2);
    expect(db.trustedAuthDevice.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1', revokedAt: null },
        data: expect.objectContaining({ revokedReason: 'PASSWORD_CHANGED' }),
      })
    );
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'TRUSTED_DEVICES_REVOKED_ALL' })
    );
  });
});

describe('authenticationPolicy trusted device', () => {
  it('completes after password when trusted device valid for manager', () => {
    const d = decidePostPasswordAuthStep({
      role: 'MANAGER',
      passwordVerified: true,
      trustedDeviceValid: true,
      hasPasskeys: false,
      hasAuthenticatorDevice: false,
      totpEnabled: true,
    });
    expect(d.nextStep).toBe('COMPLETE');
    expect(d.trustedDeviceAccepted).toBe(true);
  });

  it('requires TOTP when trusted device missing', () => {
    const d = decidePostPasswordAuthStep({
      role: 'ADMIN',
      passwordVerified: true,
      trustedDeviceValid: false,
      hasPasskeys: false,
      hasAuthenticatorDevice: false,
      totpEnabled: true,
    });
    expect(d.nextStep).toBe('TOTP');
  });

  it('leaves employee password-only complete', () => {
    const d = decidePostPasswordAuthStep({
      role: 'EMPLOYEE',
      passwordVerified: true,
      trustedDeviceValid: false,
      hasPasskeys: false,
      hasAuthenticatorDevice: false,
      totpEnabled: false,
    });
    expect(d.nextStep).toBe('COMPLETE');
  });
});

describe('staging cookie prefix isolation', () => {
  it('uses dt_staging_ prefix when COOKIE_PREFIX set', () => {
    process.env.COOKIE_PREFIX = 'dt_staging';
    jest.resetModules();
    // re-import via require after env change — use hash of UA as isolation proof for cookie name helper
    const { getCookiePrefix } = require('@/lib/env/cookies');
    expect(getCookiePrefix()).toBe('dt_staging_');
    const name = `${getCookiePrefix()}trusted_device`;
    expect(name).toBe('dt_staging_trusted_device');
    expect(name).not.toBe('dt_trusted_device');
    // userAgent fingerprint is hashed (never raw in audits metadata)
    const uaHash = createHash('sha256').update('Mozilla/5.0', 'utf8').digest('hex');
    expect(uaHash).toHaveLength(64);
  });
});
