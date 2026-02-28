import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { createHash } from 'crypto';
import { verifyRefreshToken } from '@/lib/jwt/mobileJwt';

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const refreshToken = typeof body.refreshToken === 'string' ? body.refreshToken.trim() : '';

    if (refreshToken) {
      try {
        const payload = await verifyRefreshToken(refreshToken);
        const tokenHash = sha256(refreshToken);
        const now = new Date();
        await prisma.mobileRefreshToken.updateMany({
          where: { id: payload.tokenId, tokenHash, revokedAt: null },
          data: { revokedAt: now },
        });
      } catch {
        // Ignore invalid token; still return ok
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[mobile/auth/logout]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
