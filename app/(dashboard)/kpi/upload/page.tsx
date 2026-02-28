import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { KpiUploadClient } from './KpiUploadClient';

export default async function KpiUploadPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN' && user.role !== 'MANAGER') redirect('/');

  return <KpiUploadClient />;
}
