import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';

export default async function AdminMonthSnapshotPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') redirect('/dashboard');

  redirect('/admin/import/monthly-snapshot');
}
