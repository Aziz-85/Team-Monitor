import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { AdminSystemClient } from './AdminSystemClient';

export default async function AdminSystemPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') redirect('/');

  return <AdminSystemClient />;
}
