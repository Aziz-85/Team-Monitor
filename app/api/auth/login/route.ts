import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import * as bcrypt from 'bcryptjs';
import { createSession, setSessionCookie } from '@/lib/auth';
import { cookies } from 'next/headers';
import { getRequestClientInfo } from '@/lib/requestClientInfo';
import {
  checkLoginRateLimits,
  isUserLocked,
  recordFailedLogin,
  clearFailedLogin,
  countRecentFailedAttemptsByIp,
} from '@/lib/authRateLimit';
import { SECURITY_ALERT_FAILED_ATTEMPTS_THRESHOLD } from '@/lib/sessionConfig';
import { validateCsrf } from '@/lib/csrf';
import { roleRequires2FA, signTwoFactorPendingToken } from '@/lib/twoFactor';
import { writeAuthAudit } from '@/lib/authAudit';
import { isTrustedDevicesEnabled } from '@/lib/auth/authFeatureFlags';
import { decidePostPasswordAuthStep } from '@/lib/auth/authenticationPolicy';
import {
  acceptTrustedDeviceToken,
  getTrustedDeviceCookieName,
  setTrustedDeviceCookie,
} from '@/lib/auth/trustedDevices';

const GENERIC_MESSAGE = 'Invalid credentials';

export async function POST(request: NextRequest) {
  const client = getRequestClientInfo(request.headers);

  if (!validateCsrf(request)) {
    return NextResponse.json({ error: GENERIC_MESSAGE }, { status: 403 });
  }

  try {
    const body = await request.json();
    const empId = String(body.username ?? body.empId ?? '').trim();
    const password = String(body.password ?? '');

    if (!empId || !password) {
      return NextResponse.json({ error: GENERIC_MESSAGE }, { status: 400 });
    }

    const rateLimit = await checkLoginRateLimits(client.ip ?? null, empId);
    if (rateLimit.limited) {
      await writeAuthAudit({
        event: 'LOGIN_RATE_LIMITED',
        emailAttempted: empId,
        reason: rateLimit.reason ?? 'RATE_LIMIT',
        metadata: rateLimit.blockedUntil ? { blockedUntil: rateLimit.blockedUntil.toISOString() } : undefined,
        ...client,
      });
      return NextResponse.json({ error: GENERIC_MESSAGE }, { status: 429 });
    }

    const user = await prisma.user.findUnique({
      where: { empId },
      include: { boutique: { select: { id: true, name: true, code: true } } },
    });

    if (!user) {
      await writeAuthAudit({
        event: 'LOGIN_FAILED',
        emailAttempted: empId,
        reason: 'USER_NOT_FOUND',
        ...client,
      });
      const failedCount = await countRecentFailedAttemptsByIp(client.ip ?? null);
      if (failedCount >= SECURITY_ALERT_FAILED_ATTEMPTS_THRESHOLD) {
        await writeAuthAudit({
          event: 'SECURITY_ALERT',
          emailAttempted: empId,
          reason: 'HIGH_FAILED_ATTEMPTS_SAME_IP',
          metadata: { count: failedCount },
          ...client,
        });
      }
      return NextResponse.json({ error: GENERIC_MESSAGE }, { status: 401 });
    }

    if (user.disabled) {
      await writeAuthAudit({
        event: 'LOGIN_FAILED',
        userId: user.id,
        emailAttempted: empId,
        reason: 'BLOCKED',
        ...client,
      });
      return NextResponse.json({ error: GENERIC_MESSAGE }, { status: 401 });
    }

    if (await isUserLocked(user)) {
      await writeAuthAudit({
        event: 'ACCOUNT_LOCKED',
        userId: user.id,
        emailAttempted: empId,
        reason: 'LOCKED',
        ...client,
      });
      return NextResponse.json({ error: GENERIC_MESSAGE }, { status: 401 });
    }

    if (!user.boutiqueId || !user.boutique?.id) {
      await writeAuthAudit({
        event: 'LOGIN_FAILED',
        userId: user.id,
        emailAttempted: empId,
        reason: 'NO_BOUTIQUE_ASSIGNED',
        ...client,
      });
      return NextResponse.json({ error: GENERIC_MESSAGE }, { status: 403 });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      await recordFailedLogin(user.id);
      await writeAuthAudit({
        event: 'LOGIN_FAILED',
        userId: user.id,
        emailAttempted: empId,
        reason: 'INVALID_PASSWORD',
        ...client,
      });
      const failedCount = await countRecentFailedAttemptsByIp(client.ip ?? null);
      if (failedCount >= SECURITY_ALERT_FAILED_ATTEMPTS_THRESHOLD) {
        await writeAuthAudit({
          event: 'SECURITY_ALERT',
          userId: user.id,
          emailAttempted: empId,
          reason: 'HIGH_FAILED_ATTEMPTS_SAME_IP',
          metadata: { count: failedCount },
          ...client,
        });
      }
      return NextResponse.json({ error: GENERIC_MESSAGE }, { status: 401 });
    }

    if (roleRequires2FA(user.role)) {
      try {
        const cookieStore = await cookies();
        const trustRaw = cookieStore.get(getTrustedDeviceCookieName())?.value;
        let trustedDeviceValid = false;
        let rotatedTrust: { rawToken: string; expiresAt: Date } | null = null;

        if (isTrustedDevicesEnabled() && trustRaw) {
          const accepted = await acceptTrustedDeviceToken({
            userId: user.id,
            rawToken: trustRaw,
            client,
          });
          if (accepted.ok) {
            trustedDeviceValid = true;
            rotatedTrust = {
              rawToken: accepted.rotatedRawToken,
              expiresAt: accepted.device.expiresAt,
            };
          }
        }

        const decision = decidePostPasswordAuthStep({
          role: user.role,
          passwordVerified: true,
          trustedDeviceValid,
          hasPasskeys: false,
          hasAuthenticatorDevice: false,
          totpEnabled: user.totpEnabled,
        });

        if (decision.nextStep === 'COMPLETE' && decision.trustedDeviceAccepted) {
          await clearFailedLogin(user.id);
          await writeAuthAudit({
            event: 'LOGIN_SUCCESS',
            userId: user.id,
            emailAttempted: empId,
            metadata: { viaTrustedDevice: true },
            ...client,
          });
          const sessionToken = await createSession(user.id);
          const isHttps = new URL(request.url).protocol === 'https:';
          cookieStore.set(setSessionCookie(sessionToken, { secure: isHttps }));
          if (rotatedTrust) {
            cookieStore.set(
              setTrustedDeviceCookie(rotatedTrust.rawToken, rotatedTrust.expiresAt, { secure: isHttps })
            );
          }
          return NextResponse.json({
            ok: true,
            empId: user.empId,
            role: user.role,
            boutiqueId: user.boutiqueId,
            boutiqueLabel: user.boutique ? `${user.boutique.name} (${user.boutique.code})` : undefined,
            mustChangePassword: user.mustChangePassword,
            trustedDeviceUsed: true,
          });
        }

        if (!user.totpEnabled) {
          const setupToken = await signTwoFactorPendingToken({ userId: user.id, purpose: '2fa_setup' });
          return NextResponse.json({
            ok: false,
            requires2faSetup: true,
            setupToken,
          });
        }
        const pendingToken = await signTwoFactorPendingToken({ userId: user.id, purpose: '2fa_login' });
        return NextResponse.json({
          ok: false,
          requires2fa: true,
          pendingToken,
          trustedDevicesEnabled: isTrustedDevicesEnabled(),
        });
      } catch (twoFactorErr) {
        console.error('[auth/login] 2FA token error — check MOBILE_JWT_ACCESS_SECRET', twoFactorErr);
        return NextResponse.json({ error: 'Server error' }, { status: 503 });
      }
    }

    await clearFailedLogin(user.id);
    await writeAuthAudit({
      event: 'LOGIN_SUCCESS',
      userId: user.id,
      emailAttempted: empId,
      ...client,
    });

    const token = await createSession(user.id);
    const cookieStore = await cookies();
    const isHttps = new URL(request.url).protocol === 'https:';
    cookieStore.set(setSessionCookie(token, { secure: isHttps }));

    return NextResponse.json({
      ok: true,
      empId: user.empId,
      role: user.role,
      boutiqueId: user.boutiqueId,
      boutiqueLabel: user.boutique ? `${user.boutique.name} (${user.boutique.code})` : undefined,
      mustChangePassword: user.mustChangePassword,
    });
  } catch (err) {
    console.error('[auth/login]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
