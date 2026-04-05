import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { canUseSalesTestModule } from '@/lib/test-sales/access';
import { SalesTestDashboardClient } from '@/components/test-sales/SalesTestDashboardClient';

export const dynamic = 'force-dynamic';

export default async function SalesTestDashboardPage({
  searchParams,
}: {
  searchParams?: { dateKey?: string };
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (!canUseSalesTestModule(user.role)) redirect('/dashboard');

  const dateKeyFromUrl = searchParams?.dateKey?.trim() || null;

  return <SalesTestDashboardClient initialDateKey={dateKeyFromUrl} />;
}
