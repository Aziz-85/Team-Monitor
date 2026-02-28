import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { InventoryFollowUpClient } from './InventoryFollowUpClient';

export default async function InventoryFollowUpPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role === 'EMPLOYEE' || user.role === 'ASSISTANT_MANAGER') redirect('/inventory/daily');
  return <InventoryFollowUpClient />;
}
