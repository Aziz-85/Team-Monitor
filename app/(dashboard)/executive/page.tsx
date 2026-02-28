import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { ExecutiveSinglePageClient } from './ExecutiveSinglePageClient';

export default async function ExecutivePage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role !== 'MANAGER' && user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') redirect('/dashboard');

  return (
    <div className="min-h-screen bg-[#F4F6F8] text-slate-900">
      <div className="mx-auto max-w-screen-2xl px-6 py-6">
        <ExecutiveSinglePageClient />
      </div>
    </div>
  );
}
