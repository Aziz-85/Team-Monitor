import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { ExecutiveDashboard } from '@/components/dashboard/ExecutiveDashboard';
import { ManagerDashboard } from '@/components/dashboard/ManagerDashboard';
import { resolveNavRoleForSession } from '@/lib/rbac/effectiveAccess';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const navRole = await resolveNavRoleForSession({
    id: user.id,
    role: user.role,
    canEditSchedule: user.canEditSchedule,
    boutiqueId: user.boutiqueId,
  });

  if (navRole === 'AREA_MANAGER') redirect('/area');
  if (navRole === 'EMPLOYEE' || navRole === 'ASSISTANT_MANAGER') redirect('/employee');
  if (navRole === 'MANAGER') {
    return <ManagerDashboard boutiqueId={user.boutiqueId} boutiqueName={user.boutique?.name ?? 'Boutique'} />;
  }

  return <ExecutiveDashboard />;
}
