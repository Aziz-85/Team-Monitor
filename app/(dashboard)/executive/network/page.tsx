import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { NetworkExecutiveClient } from './NetworkExecutiveClient';

export default async function NetworkExecutivePage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role !== 'MANAGER' && user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
    redirect('/dashboard');
  }

  return (
    <div className="min-h-screen bg-[#F4F6F8] text-slate-900">
      <div className="mx-auto max-w-screen-2xl px-6 py-6">
        <NetworkExecutiveClient />
      </div>
    </div>
  );
}
