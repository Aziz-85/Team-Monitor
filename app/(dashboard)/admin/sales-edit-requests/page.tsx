import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { ApprovalsClient } from '@/app/(dashboard)/approvals/ApprovalsClient';

export default async function AdminSalesEditRequestsPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN' && user.role !== 'MANAGER') redirect('/');

  return (
    <div className="p-4 md:p-6">
      <h1 className="mb-4 text-xl font-semibold text-slate-900">Sales edit requests</h1>
      <ApprovalsClient initialModule="SALES" />
    </div>
  );
}
