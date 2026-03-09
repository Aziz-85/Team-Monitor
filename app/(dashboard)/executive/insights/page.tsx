import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { ExecutiveInsightsClient } from './ExecutiveInsightsClient';

export default async function ExecutiveInsightsPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role !== 'MANAGER' && user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN' && user.role !== 'AREA_MANAGER') redirect('/dashboard');

  return (
    <div className="min-h-screen bg-[#F8F4E8]">
      <ExecutiveInsightsClient />
    </div>
  );
}
