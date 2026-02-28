import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import * as bcrypt from 'bcryptjs';
import { createHash } from 'crypto';
import { getRequestClientInfo } from '@/lib/requestClientInfo';
import { isUserLocked } from '@/lib/authRateLimit';
import { signAccessToken, signRefreshToken } from '@/lib/jwt/mobileJwt';
import { checkMobileLoginRateLimit } from '@/lib/mobileAuthRateLimit';

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
      return NextResponse.json({ error: 'empId and password required' }, { status: 400 });
    }

    const rateLimit = checkMobileLoginRateLimit(client.ip ?? null);
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: GENERIC_MESSAGE }, { status: 429 });
    }

    const user = await prisma.user.findFirst({
      where: { empId: { equals: empId, mode: 'insensitive' } },
      include: { boutique: { select: { id: true, name: true, code: true } } },
    });

    if (!user) {
      return NextResponse.json({ error: GENERIC_MESSAGE }, { status: 401 });
    }

    if (user.disabled) {
      return NextResponse.json({ error: GENERIC_MESSAGE }, { status: 401 });
    }

    if (await isUserLocked(user)) {
      return NextResponse.json({ error: GENERIC_MESSAGE }, { status: 401 });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return NextResponse.json({ error: GENERIC_MESSAGE }, { status: 401 });
    }

    if (!user.boutiqueId || !user.boutique?.id) {
      return NextResponse.json({ error: 'No boutique assigned' }, { status: 403 });
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

    const tokenRecord = await prisma.mobileRefreshToken.create({
      data: {
        userId: user.id,
        tokenHash: '', // set after we have the token
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
