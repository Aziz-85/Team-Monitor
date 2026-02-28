import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { canApproveWeek } from '@/lib/rbac/schedulePermissions';
import { ScheduleAuditEditsClient } from './ScheduleAuditEditsClient';

export default async function ScheduleAuditEditsPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (!canApproveWeek(user)) redirect('/schedule/view');
  return <ScheduleAuditEditsClient />;
}
