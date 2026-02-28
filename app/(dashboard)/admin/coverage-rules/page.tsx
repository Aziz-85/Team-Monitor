import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { AdminCoverageClient } from './AdminCoverageClient';

export default async function AdminCoveragePage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') redirect('/');

  return <AdminCoverageClient />;
}
