import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getOperationalScope } from '@/lib/scope/operationalScope';
import { NotificationsPageClient } from './NotificationsPageClient';
import { getAuthenticatedSession } from '@/lib/platformOwner/session';

export default async function NotificationsPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const auth = await getAuthenticatedSession();
  const scope = await getOperationalScope();
  const boutiques = scope ? await prisma.boutique.findMany({ where: { id: { in: scope.boutiqueIds } }, select: { id: true, name: true, code: true }, orderBy: { code: 'asc' } }) : [];
  return <NotificationsPageClient canSend={!auth?.preview && ['MANAGER', 'AREA_MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(user.role)} isPreview={Boolean(auth?.preview)} boutiques={boutiques} />;
}
