import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { AdminImportClient } from './AdminImportClient';

export default async function AdminImportPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') redirect('/');

  return <AdminImportClient />;
}
