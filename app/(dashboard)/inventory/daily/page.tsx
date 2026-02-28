import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { InventoryDailyClient } from './InventoryDailyClient';

export default async function InventoryDailyPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  return <InventoryDailyClient />;
}
