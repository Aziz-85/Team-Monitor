import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { createHash } from 'crypto';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '@/lib/jwt/mobileJwt';

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const refreshToken = typeof body.refreshToken === 'string' ? body.refreshToken.trim() : '';
    if (!refreshToken) {
      return NextResponse.json({ error: 'refreshToken required' }, { status: 400 });
    }

    let payload;
    try {
      payload = await verifyRefreshToken(refreshToken);
    } catch {
      return NextResponse.json({ error: 'Invalid refresh token' }, { status: 401 });
    }

    const tokenHash = sha256(refreshToken);
    const now = new Date();

    const existing = await prisma.mobileRefreshToken.findFirst({
      where: {
        id: payload.tokenId,
        tokenHash,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      include: { user: { select: { id: true, role: true, boutiqueId: true } } },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Invalid or expired refresh token' }, { status: 401 });
    }

    await prisma.mobileRefreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: now },
    });

    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const newRecord = await prisma.mobileRefreshToken.create({
      data: {
        userId: existing.userId,
        tokenHash: '',
        expiresAt,
      },
    });

    const newRefreshToken = await signRefreshToken({
      userId: existing.userId,
      tokenId: newRecord.id,
    });
    const newTokenHash = sha256(newRefreshToken);
    await prisma.mobileRefreshToken.update({
      where: { id: newRecord.id },
      data: { tokenHash: newTokenHash },
    });

    const accessToken = await signAccessToken({
      userId: existing.user.id,
      role: existing.user.role,
      boutiqueId: existing.user.boutiqueId,
    });

    return NextResponse.json({
      accessToken,
      refreshToken: newRefreshToken,
    });
  } catch (err) {
    console.error('[mobile/auth/refresh]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
