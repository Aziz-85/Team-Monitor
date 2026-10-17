import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getDemoGuardResponse } from '@/lib/demoGuard';

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const demoGuard = getDemoGuardResponse(request, user);
  if (demoGuard) return demoGuard;
  const body = await request.json().catch(() => ({}));
  const id = String(body.id ?? '').trim();
  if (id) {
    await prisma.notification.updateMany({ where: { id, userId: user.id }, data: { isRead: true } });
  } else {
    await prisma.notification.updateMany({ where: { userId: user.id, isRead: false }, data: { isRead: true } });
  }
  return NextResponse.json({ ok: true });
}
