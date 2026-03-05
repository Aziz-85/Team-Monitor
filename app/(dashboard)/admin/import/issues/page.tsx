import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';

export default async function AdminImportIssuesPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (!['ASSISTANT_MANAGER', 'MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(user.role)) redirect('/');

  redirect('/admin/import/sales?section=issues');
}
