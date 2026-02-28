import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { InventoryZonesPageClient } from './InventoryZonesPageClient';

export default async function InventoryZonesPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const isManagerOrAdmin = user.role === 'MANAGER' || user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';
  const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';
  return (
    <InventoryZonesPageClient
      isManagerOrAdmin={isManagerOrAdmin}
      isAdmin={isAdmin}
    />
  );
}
