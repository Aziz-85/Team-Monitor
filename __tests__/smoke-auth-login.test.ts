/**
 * Phase 7 smoke — login route validation and generic error responses.
 */

jest.mock('@/lib/authRateLimit', () => ({
  checkLoginRateLimits: jest.fn(),
  isUserLocked: jest.fn(),
  recordFailedLogin: jest.fn(),
  clearFailedLogin: jest.fn(),
  countRecentFailedAttemptsByIp: jest.fn(),
}));
jest.mock('@/lib/authAudit', () => ({ writeAuthAudit: jest.fn() }));
jest.mock('@/lib/twoFactor', () => ({
  roleRequires2FA: jest.fn().mockReturnValue(false),
  signTwoFactorPendingToken: jest.fn(),
}));
jest.mock('@/lib/db', () => ({ prisma: { user: { findUnique: jest.fn() } } }));
jest.mock('bcryptjs', () => ({ compare: jest.fn() }));
jest.mock('next/headers', () => ({ cookies: jest.fn().mockResolvedValue({ set: jest.fn() }) }));
jest.mock('@/lib/auth', () => ({
  createSession: jest.fn().mockResolvedValue('token'),
  setSessionCookie: jest.fn().mockReturnValue({ name: 'dt_session', value: 'token' }),
}));

import { checkLoginRateLimits } from '@/lib/authRateLimit';

function loginRequest(body: unknown): import('next/server').NextRequest {
  return {
    method: 'POST',
    url: 'http://localhost/api/auth/login',
    headers: new Headers({
      'x-forwarded-for': '127.0.0.1',
      'x-csrf-token': 'a'.repeat(32),
      'sec-fetch-site': 'same-origin',
    }),
    cookies: { get: () => undefined },
    json: async () => body,
  } as unknown as import('next/server').NextRequest;
}

describe('POST /api/auth/login smoke', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (checkLoginRateLimits as jest.Mock).mockResolvedValue({ limited: false });
  });

  it('returns generic error when CSRF validation fails', async () => {
    const route = await import('@/app/api/auth/login/route');
    const badRequest = {
      method: 'POST',
      url: 'http://localhost/api/auth/login',
      headers: new Headers({ 'x-forwarded-for': '127.0.0.1' }),
      cookies: { get: () => undefined },
      json: async () => ({ empId: 'E1', password: 'x' }),
    } as unknown as import('next/server').NextRequest;
    const res = await route.POST(badRequest);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('Invalid credentials');
    expect(JSON.stringify(body)).not.toContain('stack');
  });

  it('returns generic error for missing credentials', async () => {
    const route = await import('@/app/api/auth/login/route');
    const res = await route.POST(loginRequest({ empId: '', password: '' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid credentials');
  });

  it('returns 429 when rate limited without leaking reason', async () => {
    (checkLoginRateLimits as jest.Mock).mockResolvedValue({
      limited: true,
      reason: 'IP_BLOCKED',
      blockedUntil: new Date(),
    });
    const route = await import('@/app/api/auth/login/route');
    const res = await route.POST(loginRequest({ empId: 'E1', password: 'Secret#123' }));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe('Invalid credentials');
  });
});

describe('post-login landing smoke', () => {
  it('maps roles to expected landing paths', async () => {
    const { getPostLoginPath } = await import('@/lib/permissions');
    expect(getPostLoginPath('EMPLOYEE')).toBe('/employee');
    expect(getPostLoginPath('DEMO_VIEWER')).toBe('/dashboard');
    expect(getPostLoginPath('MANAGER')).toBe('/');
  });
});
