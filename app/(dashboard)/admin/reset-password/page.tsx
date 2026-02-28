import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { ResetPasswordClient } from './ResetPasswordClient';

export default async function AdminResetPasswordPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') redirect('/');

  return <ResetPasswordClient />;
}
