import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { ExecutiveEmployeesClient } from './ExecutiveEmployeesClient';

export default async function ExecutiveEmployeesPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role !== 'MANAGER' && user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') redirect('/dashboard');

  return (
    <div className="min-h-screen bg-slate-50">
      <ExecutiveEmployeesClient />
    </div>
  );
}
