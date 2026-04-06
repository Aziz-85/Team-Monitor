import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { SalesDailyClient } from './SalesDailyClient';
import type { Role } from '@prisma/client';

const ALLOWED: Role[] = ['ASSISTANT_MANAGER', 'MANAGER', 'ADMIN', 'SUPER_ADMIN', 'AREA_MANAGER'];

export default async function SalesDailyPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (!ALLOWED.includes(user.role as Role)) redirect('/');

  const canAdminUnlockLedger = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';

  return <SalesDailyClient canAdminUnlockLedger={canAdminUnlockLedger} />;
}
