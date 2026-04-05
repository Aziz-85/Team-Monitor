import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { SalesAnalyticsClient } from '@/components/sales-analytics/SalesAnalyticsClient';

const ROLES = new Set(['ASSISTANT_MANAGER', 'MANAGER', 'ADMIN', 'SUPER_ADMIN', 'AREA_MANAGER']);

function AnalyticsFallback() {
  return (
    <div className="min-h-[40vh] bg-background p-4 pb-nav md:p-6">
      <p className="text-sm text-muted">Loading…</p>
    </div>
  );
}

export default async function SalesAnalyticsPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (!ROLES.has(user.role)) redirect('/');

  return (
    <div className="min-h-screen bg-background p-4 pb-nav md:p-6">
      <Suspense fallback={<AnalyticsFallback />}>
        <SalesAnalyticsClient />
      </Suspense>
    </div>
  );
}
