import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { AdminKpiTemplatesClient } from './AdminKpiTemplatesClient';

export default async function AdminKpiTemplatesPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') redirect('/');

  return <AdminKpiTemplatesClient />;
}
