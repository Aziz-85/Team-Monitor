import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { AdminAdministrationClient } from './AdminAdministrationClient';

export default async function AdminAdministrationPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') redirect('/');

  return <AdminAdministrationClient />;
}
