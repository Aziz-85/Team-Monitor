import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { ResetEmpIdClient } from './ResetEmpIdClient';

export default async function AdminResetEmpIdPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') redirect('/');

  return <ResetEmpIdClient />;
}
