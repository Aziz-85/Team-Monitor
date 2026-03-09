import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { ExecutiveEmployeesClient } from './ExecutiveEmployeesClient';

export default async function ExecutiveEmployeesPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role !== 'MANAGER' && user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN' && user.role !== 'AREA_MANAGER') redirect('/dashboard');

  return (
    <div className="min-h-screen bg-surface-subtle">
      <ExecutiveEmployeesClient />
    </div>
  );
}
