import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { ExecutiveCompareClient } from './ExecutiveCompareClient';

export default async function ExecutiveComparePage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role !== 'MANAGER' && user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') redirect('/dashboard');

  return (
    <div className="min-h-screen bg-slate-50">
      <ExecutiveCompareClient />
    </div>
  );
}
