import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { NetworkExecutiveClient } from './NetworkExecutiveClient';

export default async function NetworkExecutivePage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role !== 'MANAGER' && user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN' && user.role !== 'AREA_MANAGER') {
    redirect('/dashboard');
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-screen-2xl px-6 py-6">
        <NetworkExecutiveClient />
      </div>
    </div>
  );
}
