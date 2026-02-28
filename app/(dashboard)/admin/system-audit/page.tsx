import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { SystemAuditClient } from './SystemAuditClient';

export default async function AdminSystemAuditPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') redirect('/');

  return <SystemAuditClient />;
}
