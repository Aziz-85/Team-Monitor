import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';

export default async function AdminAdministrationUsersPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') redirect('/');

  redirect('/admin/users');
}
