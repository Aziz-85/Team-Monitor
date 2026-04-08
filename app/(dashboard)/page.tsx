import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { canAccessRoute, getPostLoginPath } from '@/lib/permissions';
import { resolveNavRoleForSession } from '@/lib/rbac/effectiveAccess';
import { getMyActiveZoneAssignmentForCurrentQuarter } from '@/lib/services/inventoryZones';
import { HomePageClient } from './HomePageClient';

export default async function HomePage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const navRole = await resolveNavRoleForSession({
    id: user.id,
    role: user.role,
    canEditSchedule: user.canEditSchedule,
    boutiqueId: user.boutiqueId,
  });
  if (!canAccessRoute(navRole, '/')) {
    redirect(getPostLoginPath(navRole));
  }

  const myZone = await getMyActiveZoneAssignmentForCurrentQuarter(user.id);

  return <HomePageClient myZone={myZone} boutiqueName={user.boutique?.name ?? ''} />;
}
