import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';

export default async function MonthlyMatrixPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const allowed: string[] = ['ADMIN', 'MANAGER', 'ASSISTANT_MANAGER', 'SUPER_ADMIN'];
  if (!allowed.includes(user.role)) redirect('/');

  redirect('/admin/import/sales?section=monthly');
}
