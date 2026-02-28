import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { BoutiqueTasksClient } from './BoutiqueTasksClient';

export default async function BoutiqueTasksPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role !== 'MANAGER' && user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') redirect('/');

  return <BoutiqueTasksClient />;
}
