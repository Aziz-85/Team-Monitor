import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { canEditSchedule } from '@/lib/permissions';
import { ScheduleAuditClient } from './ScheduleAuditClient';

export default async function ScheduleAuditPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role === 'ASSISTANT_MANAGER' || !canEditSchedule(user.role)) redirect('/schedule/view');
  return <ScheduleAuditClient />;
}
