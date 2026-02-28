import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { getMyActiveZoneAssignmentForCurrentQuarter } from '@/lib/services/inventoryZones';
import { HomePageClient } from './HomePageClient';

export default async function HomePage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role === 'EMPLOYEE' || user.role === 'ASSISTANT_MANAGER') redirect('/employee');

  const myZone = await getMyActiveZoneAssignmentForCurrentQuarter(user.id);

  return <HomePageClient myZone={myZone} />;
}
