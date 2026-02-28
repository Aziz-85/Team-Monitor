import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { AdminBoutiqueDetailClient } from './AdminBoutiqueDetailClient';

export default async function AdminBoutiqueDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') redirect('/');

  const { id } = await params;
  return <AdminBoutiqueDetailClient boutiqueId={id} />;
}
