import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { canEditSchedule } from '@/lib/rbac/schedulePermissions';
import { getRamadanRange } from '@/lib/time/ramadan';
import { ScheduleV3Client } from './ScheduleV3Client';

export default async function ScheduleV3Page() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (!canEditSchedule(user)) redirect('/schedule/view');
  const ramadanRange = getRamadanRange();
  return (
    <div className="w-full min-w-0 overflow-x-hidden">
      <ScheduleV3Client ramadanRange={ramadanRange} />
    </div>
  );
}
