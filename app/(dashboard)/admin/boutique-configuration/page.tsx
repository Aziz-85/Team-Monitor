import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { BoutiqueConfigurationClient } from './BoutiqueConfigurationClient';

export default async function BoutiqueConfigurationPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') redirect('/');

  return <BoutiqueConfigurationClient />;
}
