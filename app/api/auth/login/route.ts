import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';
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

const GENERIC_MESSAGE = 'Invalid credentials';

type AuditEvent =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'LOGIN_RATE_LIMITED'
  | 'ACCOUNT_LOCKED'
  | 'SECURITY_ALERT';

async function writeAuthAudit(data: {
  event: AuditEvent;
  userId?: string | null;
  emailAttempted?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  deviceHint?: string | null;
  reason?: string | null;
  metadata?: Prisma.InputJsonValue | null;
}) {
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
    // Do not fail login if audit write fails
  }
}

export async function POST(request: NextRequest) {
  const client = getRequestClientInfo(request.headers);

  try {
    const body = await request.json();
    const empId = String(body.username ?? body.empId ?? '').trim();
    const password = String(body.password ?? '');

    if (!empId || !password) {
      return NextResponse.json({ error: 'Username and password required' }, { status: 400 });
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

    await clearFailedLogin(user.id);
    await writeAuthAudit({
      event: 'LOGIN_SUCCESS',
      userId: user.id,
      emailAttempted: empId,
      ...client,
    });

    const token = await createSession(user.id);
    const cookieStore = await cookies();
    cookieStore.set(setSessionCookie(token));

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
