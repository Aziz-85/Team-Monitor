import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { canApproveWeek } from '@/lib/rbac/schedulePermissions';
import { ApprovalsClient } from './ApprovalsClient';

export default async function ApprovalsPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (!canApproveWeek(user)) redirect('/');
  return <ApprovalsClient />;
}
