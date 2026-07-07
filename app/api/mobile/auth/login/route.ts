import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import * as bcrypt from 'bcryptjs';
import { createHash } from 'crypto';
import { getRequestClientInfo } from '@/lib/requestClientInfo';
import {
  checkLoginRateLimits,
  isUserLocked,
  recordFailedLogin,
  clearFailedLogin,
  countRecentFailedAttemptsByIp,
} from '@/lib/authRateLimit';
import { SECURITY_ALERT_FAILED_ATTEMPTS_THRESHOLD } from '@/lib/sessionConfig';
import { signAccessToken, signRefreshToken } from '@/lib/jwt/mobileJwt';
import { writeAuthAudit } from '@/lib/authAudit';

const GENERIC_MESSAGE = 'Invalid credentials';

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export async function POST(request: NextRequest) {
  const client = getRequestClientInfo(request.headers);

  try {
    const body = await request.json();
    const empId = String(body.empId ?? '').trim();
    const password = String(body.password ?? '');
    const deviceHint = typeof body.deviceHint === 'string' ? body.deviceHint : client.deviceHint;

    if (!empId || !password) {
      return NextResponse.json({ error: GENERIC_MESSAGE }, { status: 400 });
    }

    const rateLimit = await checkLoginRateLimits(client.ip ?? null, empId);
    if (rateLimit.limited) {
      await writeAuthAudit({
        event: 'LOGIN_RATE_LIMITED',
        emailAttempted: empId,
        reason: rateLimit.reason ?? 'RATE_LIMIT',
        ...client,
        deviceHint: deviceHint ?? client.deviceHint,
      });
      return NextResponse.json({ error: GENERIC_MESSAGE }, { status: 429 });
    }

    const user = await prisma.user.findFirst({
      where: { empId: { equals: empId, mode: 'insensitive' } },
      include: { boutique: { select: { id: true, name: true, code: true } } },
    });

    if (!user) {
      await writeAuthAudit({
        event: 'LOGIN_FAILED',
        emailAttempted: empId,
        reason: 'USER_NOT_FOUND',
        ...client,
        deviceHint: deviceHint ?? client.deviceHint,
      });
      return NextResponse.json({ error: GENERIC_MESSAGE }, { status: 401 });
    }

    if (user.disabled) {
      await writeAuthAudit({
        event: 'LOGIN_FAILED',
        userId: user.id,
        emailAttempted: empId,
        reason: 'BLOCKED',
        ...client,
        deviceHint: deviceHint ?? client.deviceHint,
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
        deviceHint: deviceHint ?? client.deviceHint,
      });
      return NextResponse.json({ error: GENERIC_MESSAGE }, { status: 401 });
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
        deviceHint: deviceHint ?? client.deviceHint,
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
          deviceHint: deviceHint ?? client.deviceHint,
        });
      }
      return NextResponse.json({ error: GENERIC_MESSAGE }, { status: 401 });
    }

    if (!user.boutiqueId || !user.boutique?.id) {
      return NextResponse.json({ error: GENERIC_MESSAGE }, { status: 403 });
    }

    await clearFailedLogin(user.id);
    await writeAuthAudit({
      event: 'LOGIN_SUCCESS',
      userId: user.id,
      emailAttempted: empId,
      ...client,
      deviceHint: deviceHint ?? client.deviceHint,
      metadata: { channel: 'mobile' },
    });

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const tokenRecord = await prisma.mobileRefreshToken.create({
      data: {
        userId: user.id,
        tokenHash: '',
        expiresAt,
        deviceHint: deviceHint ?? null,
        ip: client.ip ?? null,
      },
    });

    const refreshToken = await signRefreshToken({
      userId: user.id,
      tokenId: tokenRecord.id,
    });
    const tokenHash = sha256(refreshToken);

    await prisma.mobileRefreshToken.update({
      where: { id: tokenRecord.id },
      data: { tokenHash },
    });

    const accessToken = await signAccessToken({
      userId: user.id,
      role: user.role,
      boutiqueId: user.boutiqueId,
    });

    return NextResponse.json({
      accessToken,
      refreshToken,
      user: { id: user.id, empId: user.empId, role: user.role },
      boutiqueId: user.boutiqueId,
    });
  } catch (err) {
    console.error('[mobile/auth/login]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
