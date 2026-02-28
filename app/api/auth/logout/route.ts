import { NextRequest, NextResponse } from 'next/server';
import { clearSessionCookie, getSessionUser, invalidateSessionByToken } from '@/lib/auth';
import { cookies } from 'next/headers';
import { getRequestClientInfo } from '@/lib/requestClientInfo';
import { prisma } from '@/lib/db';

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get('dt_session')?.value;
  const user = await getSessionUser();
  const client = getRequestClientInfo(request.headers);

  if (user) {
    try {
      await prisma.authAuditLog.create({
        data: {
          event: 'LOGOUT',
          userId: user.id,
          ip: client.ip,
          userAgent: client.userAgent,
          deviceHint: client.deviceHint,
        },
      });
    } catch {
      // Do not fail logout if audit write fails
    }
  }

  if (token) await invalidateSessionByToken(token);
  cookieStore.set(clearSessionCookie());
  return NextResponse.json({ ok: true });
}
