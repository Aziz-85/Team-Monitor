import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';

export default async function AdminAdministrationAuditPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') redirect('/');

  redirect('/admin/audit/login');
}
