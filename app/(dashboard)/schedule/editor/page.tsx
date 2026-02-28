import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { canEditSchedule } from '@/lib/permissions';
import { ScheduleEditorClient } from './ScheduleEditorClient';

export default async function ScheduleEditorPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (!canEditSchedule(user.role)) redirect('/schedule/view');

  return <ScheduleEditorClient />;
}
