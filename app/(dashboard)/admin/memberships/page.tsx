import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { AdminMembershipsClient } from './AdminMembershipsClient';

export default async function AdminMembershipsPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') redirect('/');

  return <AdminMembershipsClient />;
}
