import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { canEditSchedule } from '@/lib/rbac/schedulePermissions';
import { getTranslations } from 'next-intl/server';
import { ScheduleNextPage } from '@/components/schedule-next/ScheduleNextPage';

function saturdayWeekStart(d: Date): string {
  const copy = new Date(d);
  const day = copy.getUTCDay();
  const daysBack = (day - 6 + 7) % 7;
  copy.setUTCDate(copy.getUTCDate() - daysBack);
  return copy.toISOString().slice(0, 10);
}

export default async function ScheduleNextRoutePage({
  searchParams,
}: {
  searchParams: { weekStart?: string };
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (!canEditSchedule(user)) redirect('/schedule/view');

  const t = await getTranslations();
  const weekStart =
    typeof searchParams.weekStart === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.weekStart)
      ? searchParams.weekStart
      : saturdayWeekStart(new Date());

  return (
    <div className="w-full min-w-0 overflow-x-hidden">
      <ScheduleNextPage initialWeekStart={weekStart} t={(key) => t(key)} />
    </div>
  );
}
