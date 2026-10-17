import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getOperationalScope } from '@/lib/scope/operationalScope';
import { getActiveBoutiqueUserIds, notifyUsers } from '@/lib/notify/inApp';
import { getDemoGuardResponse } from '@/lib/demoGuard';

const SEND_ROLES = new Set(['MANAGER', 'AREA_MANAGER', 'ADMIN', 'SUPER_ADMIN']);

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.notification.count({ where: { userId: user.id, isRead: false } }),
  ]);
  return NextResponse.json({ items, unread, canSend: SEND_ROLES.has(user.role) });
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const demoGuard = getDemoGuardResponse(request, user);
  if (demoGuard) return demoGuard;
  if (!SEND_ROLES.has(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const title = String(body.title ?? '').trim();
  const message = String(body.body ?? '').trim();
  const boutiqueId = String(body.boutiqueId ?? '').trim();
  if (!title || !message) return NextResponse.json({ error: 'title and body required' }, { status: 400 });

  const scope = await getOperationalScope(request);
  if (!scope) return NextResponse.json({ error: 'No operational scope' }, { status: 403 });
  const targetBoutiqueIds = boutiqueId === 'ALL' ? scope.boutiqueIds : [boutiqueId || scope.boutiqueId];
  if (targetBoutiqueIds.some((id) => !scope.boutiqueIds.includes(id))) {
    return NextResponse.json({ error: 'Boutique outside your scope' }, { status: 403 });
  }
  const recipients = Array.from(new Set((await Promise.all(targetBoutiqueIds.map(getActiveBoutiqueUserIds))).flat())).filter((id) => id !== user.id);
  await notifyUsers({ userIds: recipients, title, body: message, linkPath: '/' });
  return NextResponse.json({ ok: true, recipients: recipients.length });
}
