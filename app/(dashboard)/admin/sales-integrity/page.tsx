import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { SalesIntegrityClient } from './SalesIntegrityClient';

export default async function AdminSalesIntegrityPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') redirect('/');

  return <SalesIntegrityClient />;
}
