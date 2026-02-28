import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';

export default async function SalesImportPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN' && user.role !== 'MANAGER') redirect('/');

  redirect('/admin/import/sales?section=import');
}
