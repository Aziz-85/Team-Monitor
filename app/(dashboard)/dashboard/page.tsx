import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { ExecutiveDashboard } from '@/components/dashboard/ExecutiveDashboard';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  return <ExecutiveDashboard />;
}
