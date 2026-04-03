import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { canAccessRoute } from '@/lib/permissions';
import type { Role } from '@/lib/permissions';
import { PerformanceHubClient } from './PerformanceHubClient';

export default async function PerformancePage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const role = user.role as Role;
  if (!canAccessRoute(role, '/performance')) {
    redirect('/dashboard');
  }
  return (
    <div className="min-h-screen bg-background p-4 pb-nav md:p-6">
      <PerformanceHubClient />
    </div>
  );
}
