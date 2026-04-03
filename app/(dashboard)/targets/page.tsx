import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { ADMIN_TARGETS_PAGE_ROLES } from '@/lib/targets/adminTargetsPageRoles';
import { AdminTargetsClient } from '../admin/targets/AdminTargetsClient';
import { TargetsOverviewClient } from './TargetsOverviewClient';
import type { Role } from '@prisma/client';

export default async function TargetsPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  if (ADMIN_TARGETS_PAGE_ROLES.includes(user.role as Role)) {
    return <AdminTargetsClient />;
  }

  return (
    <div className="min-h-screen bg-background p-4 pb-nav md:p-6">
      <TargetsOverviewClient />
    </div>
  );
}
