import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { SyncPlannerClient } from './SyncPlannerClient';

const PLANNER_SYNC_ROLES = ['MANAGER', 'ADMIN', 'SUPER_ADMIN', 'AREA_MANAGER'] as const;

export default async function SyncPlannerPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (!PLANNER_SYNC_ROLES.includes(user.role as (typeof PLANNER_SYNC_ROLES)[number])) redirect('/');
  return <SyncPlannerClient />;
}
