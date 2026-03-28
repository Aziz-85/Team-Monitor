import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { WeeklyReportClient } from './WeeklyReportClient';

const ROLES = ['MANAGER', 'ADMIN', 'SUPER_ADMIN', 'AREA_MANAGER'] as const;

export default async function WeeklyReportPage({
  searchParams,
}: {
  searchParams: { weekStart?: string };
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (!ROLES.includes(user.role as (typeof ROLES)[number])) redirect('/');

  const initialWeekStart =
    typeof searchParams.weekStart === 'string' ? searchParams.weekStart.trim() : undefined;

  return (
    <div className="min-h-screen bg-background p-4 pb-nav md:p-6">
      <Suspense
        fallback={<p className="mx-auto max-w-6xl p-4 text-sm text-muted">Loading…</p>}
      >
        <WeeklyReportClient initialWeekStart={initialWeekStart} />
      </Suspense>
    </div>
  );
}
