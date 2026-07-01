import { redirect } from 'next/navigation';

export default function ScheduleExportRedirectPage({
  searchParams,
}: {
  searchParams: { weekStart?: string; type?: string };
}) {
  const q = new URLSearchParams();
  q.set('category', 'schedule');
  if (searchParams.weekStart) q.set('weekStart', searchParams.weekStart);
  redirect(`/reports/export-center?${q.toString()}`);
}
