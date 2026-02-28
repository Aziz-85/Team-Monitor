import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { AdminRegionsClient } from './AdminRegionsClient';

export default async function AdminRegionsPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') redirect('/');

  return <AdminRegionsClient />;
}
