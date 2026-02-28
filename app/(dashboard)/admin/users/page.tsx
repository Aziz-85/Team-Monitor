import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { AdminUsersClient } from './AdminUsersClient';

export default async function AdminUsersPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') redirect('/');

  return <AdminUsersClient />;
}
