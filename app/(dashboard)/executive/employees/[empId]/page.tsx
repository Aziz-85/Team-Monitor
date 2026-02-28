import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { ExecutiveEmployeeDetailClient } from './ExecutiveEmployeeDetailClient';

export default async function ExecutiveEmployeeDetailPage({
  params,
}: {
  params: Promise<{ empId: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role !== 'MANAGER' && user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') redirect('/dashboard');

  const { empId } = await params;
  return (
    <div className="min-h-screen bg-slate-50">
      <ExecutiveEmployeeDetailClient empId={empId} />
    </div>
  );
}
