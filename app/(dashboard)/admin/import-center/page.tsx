import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { ImportCenterClient } from '../import/ImportCenterClient';

/** Alias route: same unified Import Center as `/admin/import`. */
export default async function AdminImportCenterPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') redirect('/');

  return <ImportCenterClient />;
}
