import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { DelegationControlClient } from './DelegationControlClient';

export default async function DelegationControlPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN' && user.role !== 'MANAGER') redirect('/');

  return (
    <div className="min-h-screen bg-background p-4 pb-nav md:p-6">
      <DelegationControlClient
        isAdmin={user.role === 'ADMIN' || user.role === 'SUPER_ADMIN'}
        defaultBoutiqueId={user.boutiqueId ?? ''}
      />
    </div>
  );
}
