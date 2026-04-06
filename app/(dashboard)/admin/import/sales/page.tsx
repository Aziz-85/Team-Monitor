import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { SalesImportTabsClient } from './SalesImportTabsClient';

/** Union of roles that can access any of the 5 consolidated tabs (preserve existing RBAC). */
const ALLOWED_ROLES = ['ASSISTANT_MANAGER', 'MANAGER', 'ADMIN', 'SUPER_ADMIN', 'AREA_MANAGER'] as const;

export default async function AdminImportSalesPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (!ALLOWED_ROLES.includes(user.role as (typeof ALLOWED_ROLES)[number])) redirect('/');

  const canResolve = user.role === 'MANAGER' || user.role === 'ADMIN' || user.role === 'SUPER_ADMIN' || user.role === 'AREA_MANAGER';
  const canAdminUnlockLedger = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';

  return <SalesImportTabsClient canResolve={canResolve} canAdminUnlockLedger={canAdminUnlockLedger} />;
}
