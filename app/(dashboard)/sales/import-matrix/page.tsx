import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';

export default async function ImportMatrixPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const allowed = ['ADMIN', 'SUPER_ADMIN', 'MANAGER'];
  if (!allowed.includes(user.role)) redirect('/');

  redirect('/admin/import/sales?section=matrix');
}
