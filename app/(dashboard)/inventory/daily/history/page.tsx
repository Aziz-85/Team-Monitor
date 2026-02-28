import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { InventoryHistoryClient } from './InventoryHistoryClient';

export default async function InventoryHistoryPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role === 'EMPLOYEE' || user.role === 'ASSISTANT_MANAGER') redirect('/inventory/daily');
  return <InventoryHistoryClient />;
}
