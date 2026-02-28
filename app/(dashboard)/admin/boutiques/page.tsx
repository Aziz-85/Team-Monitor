import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { AdminBoutiquesClient } from './AdminBoutiquesClient';

export default async function AdminBoutiquesPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') redirect('/');

  return <AdminBoutiquesClient />;
}
