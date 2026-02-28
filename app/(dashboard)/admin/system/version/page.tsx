import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { AdminVersionClient } from './AdminVersionClient';

export default async function AdminVersionPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') redirect('/');

  return <AdminVersionClient />;
}
