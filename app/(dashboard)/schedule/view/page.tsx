import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { canViewFullSchedule } from '@/lib/permissions';
import { getRamadanRange } from '@/lib/time/ramadan';
import { ScheduleViewClient } from './ScheduleViewClient';

export default async function ScheduleViewPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const fullGrid = canViewFullSchedule(user.role);
  const ramadanRange = getRamadanRange();
  return (
    <ScheduleViewClient
      fullGrid={fullGrid}
      ramadanRange={ramadanRange}
    />
  );
}
