import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { PlannerIntegrationClient } from './PlannerIntegrationClient';

export default async function PlannerIntegrationPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN' && user.role !== 'AREA_MANAGER') redirect('/');

  return <PlannerIntegrationClient />;
}
