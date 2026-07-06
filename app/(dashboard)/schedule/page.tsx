import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { canEditSchedule } from '@/lib/rbac/schedulePermissions';

export default async function SchedulePage() {
  const user = await getSessionUser();
  if (user && canEditSchedule(user)) {
    redirect('/schedule/edit');
  }
  redirect('/schedule/view');
}
