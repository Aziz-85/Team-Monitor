import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { AdminTargetsClient } from './AdminTargetsClient';

export default async function AdminTargetsPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN' && user.role !== 'MANAGER') redirect('/');

  return <AdminTargetsClient />;
}
